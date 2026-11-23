import { beforeAll, describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from '../src/lib/server/db';
import { handleAPI } from '../src/lib/server/api';
import { exportPier, verifyPier } from '../src/lib/server/pier';
import { verifyJournal } from '../src/lib/server/journal';
const jars: Record<string, Map<string, string>> = {};
async function call(path: string, method = 'GET', body?: any, who = 'public') {
  const jar = (jars[who] ??= new Map());
  const request = new Request('http://localhost/api/' + path, {
    method,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    headers:
      body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
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
let temp = '';
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'yogilib-pier-'));
  process.env.YOGILIB_DATABASE = 'pglite';
  process.env.YOGILIB_LOCAL_DB = join(temp, 'db');
  process.env.YOGILIB_UPLOAD_DIR = join(temp, 'uploads');
  await database();
  for (const role of ['uploader', 'admin'])
    expect((await call('demo', 'POST', { role }, role)).status).toBe(200);
  const form = new FormData();
  form.set('title', 'Pier original');
  form.set('title_np', 'मूल प्रति');
  form.set('category', 'कागजात');
  form.set('body_html', '<p>नेपाली पाठ</p>');
  form.set('file', new File(['%PDF-1.4\n%%EOF'], 'scan.pdf'));
  const created = await call('documents', 'POST', form, 'uploader');
  expect(created.status).toBe(201);
  expect(
    (
      await call(
        'documents/' + created.data.id,
        'PUT',
        { ...created.data, title: 'Pier original, edited' },
        'admin',
      )
    ).status,
  ).toBe(200);
});
describe('Pier export', () => {
  it('writes a self-contained archive that verifies offline', async () => {
    const dir = join(temp, 'pier');
    const db = await database();
    const m = await exportPier(db, dir);
    expect(m.counts.documents).toBeGreaterThanOrEqual(2);
    expect(m.counts.originals).toBe(1);
    expect(m.counts.revisions).toBeGreaterThanOrEqual(1);
    expect(m.journal_head).toBe((await verifyJournal(db)).head);
    const docs = (await readFile(join(dir, 'documents.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const doc = docs.find((d) => d.title === 'Pier original, edited');
    expect(doc.title_np).toBe('मूल प्रति');
    expect(doc.body_html).toContain('नेपाली पाठ');
    expect(await readdir(join(dir, 'originals'))).toEqual([
      doc.original_sha256 + '.pdf',
    ]);
    // Private data is never part of a pier.
    const all = (
      await Promise.all(
        [
          'documents.jsonl',
          'revisions.jsonl',
          'journal.jsonl',
          'manifest.json',
        ].map((f) => readFile(join(dir, f), 'utf8')),
      )
    ).join('');
    expect(all).not.toMatch(/password|token_hash|demo\.yogilib\.invalid/);
    expect((await verifyPier(dir)).ok).toBe(true);
    await expect(exportPier(db, dir)).rejects.toThrow(/non-empty/);
  });
  it('detects damaged originals and rewritten history', async () => {
    const dir = join(temp, 'pier');
    const original = join(
      dir,
      'originals',
      (await readdir(join(dir, 'originals')))[0],
    );
    const bytes = await readFile(original);
    await writeFile(original, Buffer.concat([bytes, Buffer.from(' ')]));
    expect((await verifyPier(dir)).problems.join()).toMatch(/damaged/);
    await writeFile(original, bytes);
    const path = join(dir, 'journal.jsonl');
    const journal = await readFile(path, 'utf8');
    await writeFile(path, journal.replace('Pier original', 'Forged title'));
    const v = await verifyPier(dir);
    expect(v.ok).toBe(false);
    expect(v.problems.join()).toMatch(
      /journal.jsonl does not match|Journal chain breaks/,
    );
    await writeFile(path, journal);
    expect((await verifyPier(dir)).ok).toBe(true);
    expect((await verifyPier(join(temp, 'nothing'))).ok).toBe(false);
  });
});
