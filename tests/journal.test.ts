import { beforeAll, describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from '../src/lib/server/db';
import { handleAPI } from '../src/lib/server/api';
import { GENESIS, verifyJournal } from '../src/lib/server/journal';
const jars: Record<string, Map<string, string>> = {};
async function call(path: string, method = 'GET', body?: any, who = 'public') {
  const jar = (jars[who] ??= new Map());
  const request = new Request('http://localhost/api/' + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const result = await handleAPI({
    request,
    url: new URL(request.url),
    params: { path: path.split('?')[0] },
    cookies: {
      get: (k: string) => jar.get(k),
      set: (k: string, v: string) => jar.set(k, v),
      delete: (k: string) => jar.delete(k),
    },
    getClientAddress: () => who,
  } as any);
  return {
    status: result.status,
    data: await result.json().catch(() => undefined),
  };
}
const sample = {
  title: 'Journal test',
  title_np: 'अभिलेख परीक्षण',
  category: 'कागजात',
  body_html: '<p>मूल पाठ — original text</p>',
};
beforeAll(async () => {
  const temp = await mkdtemp(join(tmpdir(), 'yogilib-journal-'));
  process.env.YOGILIB_DATABASE = 'pglite';
  process.env.YOGILIB_LOCAL_DB = join(temp, 'db');
  process.env.YOGILIB_UPLOAD_DIR = join(temp, 'uploads');
  await database();
  for (const role of ['viewer', 'uploader', 'admin'])
    expect((await call('demo', 'POST', { role }, role)).status).toBe(200);
});
describe('Archive journal', () => {
  it('records create, edit, restore and delete as a verifiable chain', async () => {
    const created = await call('documents', 'POST', sample, 'uploader');
    expect(created.status).toBe(201);
    const id = created.data.id;
    const edited = await call(
      'documents/' + id,
      'PUT',
      { ...created.data, title: 'Journal test, edited' },
      'admin',
    );
    expect(edited.status).toBe(200);
    const revisions = await call(
      `documents/${id}/revisions`,
      'GET',
      undefined,
      'admin',
    );
    const restored = await call(
      `documents/${id}/revisions/${revisions.data[0].id}`,
      'POST',
      { version: edited.data.version },
      'admin',
    );
    expect(restored.status).toBe(200);
    expect(
      (await call('documents/' + id, 'DELETE', undefined, 'uploader')).status,
    ).toBe(200);

    const feed = await call('journal');
    expect(feed.status).toBe(200);
    expect(feed.data.enabled).toBe(true);
    const mine = feed.data.changes.filter((c: any) => c.document_id === id);
    expect(mine.map((c: any) => c.action)).toEqual([
      'delete',
      'restore',
      'edit',
      'create',
    ]);
    expect(mine[0].title_np).toBe('अभिलेख परीक्षण');
    expect(mine[0].recoverable).toBe(true);
    // The public feed never reveals who made a change.
    expect(JSON.stringify(feed.data)).not.toContain('demo.yogilib.invalid');
    expect(mine[0]).not.toHaveProperty('actor');

    const verified = await call('journal/verify', 'GET', undefined, 'admin');
    expect(verified.data).toMatchObject({ ok: true, enabled: true });
    expect(verified.data.count).toBeGreaterThanOrEqual(4);
    expect(verified.data.head).not.toBe(GENESIS);
  });

  it('recovers a deleted document under its original ID, admins only', async () => {
    const created = await call('documents', 'POST', sample, 'admin');
    const id = created.data.id;
    await call('documents/' + id, 'DELETE', undefined, 'admin');
    expect((await call('documents/' + id)).status).toBe(404);
    const entry = (await call('journal')).data.changes.find(
      (c: any) => c.document_id === id && c.action === 'delete',
    );
    expect(
      (await call(`journal/${entry.seq}/recover`, 'POST', {}, 'viewer')).status,
    ).toBe(403);
    expect(
      (await call(`journal/${entry.seq}/recover`, 'POST', {}, 'uploader'))
        .status,
    ).toBe(403);
    const recovered = await call(
      `journal/${entry.seq}/recover`,
      'POST',
      {},
      'admin',
    );
    expect(recovered.status).toBe(201);
    expect(recovered.data.id).toBe(id);
    const back = await call('documents/' + id);
    expect(back.data.body_html).toContain('मूल पाठ');
    expect(back.data.title_np).toBe('अभिलेख परीक्षण');
    // The recovery is now the latest entry, so the old deletion cannot be replayed.
    expect(
      (await call(`journal/${entry.seq}/recover`, 'POST', {}, 'admin')).status,
    ).toBe(404);
    const after = (await call('journal')).data.changes;
    expect(after[0]).toMatchObject({ action: 'recover', document_id: id });
    expect(after.find((c: any) => c.seq === entry.seq).recoverable).toBe(false);
  });

  it('keeps every document recoverable after delete-all', async () => {
    const ids = (await call('documents')).data.documents.map((d: any) => d.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(
      (await call('documents/all', 'DELETE', undefined, 'admin')).data.deleted,
    ).toBe(ids.length);
    const changes = (await call('journal')).data.changes;
    for (const id of ids) {
      const deletes = changes.filter(
        (c: any) => c.document_id === id && c.action === 'delete',
      );
      // Only the latest deletion of a document is offered for recovery.
      expect(deletes[0].recoverable).toBe(true);
      expect(deletes.slice(1).every((c: any) => !c.recoverable)).toBe(true);
    }
    const stale = changes.find(
      (c: any) => c.action === 'delete' && !c.recoverable,
    );
    expect(
      (await call(`journal/${stale.seq}/recover`, 'POST', {}, 'admin')).status,
    ).toBe(404);
    expect(
      (await call('journal/verify', 'GET', undefined, 'admin')).data.ok,
    ).toBe(true);
  });

  it('detects tampering with recorded history', async () => {
    const db = await database();
    await db.query(
      "UPDATE archive_journal SET entry=replace(entry,'Journal test','Rewritten') WHERE seq=(SELECT min(seq) FROM archive_journal)",
    );
    const result = await verifyJournal(db);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe('1');
  });

  it('restricts verification and validates paging', async () => {
    expect(
      (await call('journal/verify', 'GET', undefined, 'viewer')).status,
    ).toBe(403);
    expect((await call('journal/verify')).status).toBe(401);
    expect((await call('journal?before=x')).status).toBe(400);
    const page = await call('journal?before=3');
    expect(page.data.changes.every((c: any) => Number(c.seq) < 3)).toBe(true);
  });
});
