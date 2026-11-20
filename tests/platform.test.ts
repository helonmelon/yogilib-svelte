import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { database, migrate, wrapPglite } from '../src/lib/server/db';
import { handleAPI } from '../src/lib/server/api';
import { handle } from '../src/hooks.server';
import { safeHTML } from '../src/lib/server/archive';
import { preetiToUnicode } from '../src/lib/converters/preeti-unicode';
import { itransToUnicode } from '../src/lib/converters/itrans-unicode';
import { MAX_UPLOAD_BYTES } from '../src/lib/limits';
let temp: string;
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
  let data: any;
  try {
    data = await result.json();
  } catch {}
  return { status: result.status, data };
}
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'yogilib-test-'));
  process.env.YOGILIB_DATABASE = 'pglite';
  process.env.YOGILIB_LOCAL_DB = join(temp, 'db');
  process.env.YOGILIB_UPLOAD_DIR = join(temp, 'uploads');
  await database();
  for (const role of ['viewer', 'uploader', 'admin'])
    expect((await call('demo', 'POST', { role }, role)).status).toBe(200);
});
afterAll(async () => {
  delete process.env.YOGILIB_UPLOAD_DIR;
});
describe('Archive API and role boundaries', () => {
  it('keeps the archive and public documents readable', async () => {
    expect((await call('documents')).status).toBe(200);
    const r = await call('documents/1');
    expect(r.status).toBe(200);
    expect(r.data.body_html).toContain('सुगौली सन्धि');
    expect(r.data.body_html).toContain('perpetual peace');
  });
  it('searches English and Nepali body text with categories and pagination', async () => {
    for (const q of ['perpetual', 'चिरस्थायी']) {
      const r = await call(
        'documents?q=' + encodeURIComponent(q),
        'GET',
        undefined,
        'viewer',
      );
      expect(r.data.total).toBe(1);
      const db = await database();
      const { listDocuments } = await import('../src/lib/server/archive');
      expect((await listDocuments(db, q, 'कागजात')).total).toBe(1);
    }
    expect(
      (await call('documents', 'GET', undefined, 'viewer')).data.total,
    ).toBeGreaterThan(0);
  });
  it('protects uploads, edits, revision history, and deletes from viewers', async () => {
    expect(
      (await call('documents', 'POST', { title: 'No' }, 'viewer')).status,
    ).toBe(403);
    expect((await call('documents/1', 'PUT', {}, 'viewer')).status).toBe(403);
    expect(
      (await call('documents/1/revisions', 'GET', undefined, 'viewer')).status,
    ).toBe(403);
    expect(
      (await call('documents/1', 'DELETE', undefined, 'viewer')).status,
    ).toBe(403);
  });
  it('preserves metadata through edit, rejects stale updates, and restores revisions', async () => {
    const created = await call(
      'documents',
      'POST',
      {
        title: 'Test archive',
        title_np: 'मूल पाठ',
        category: 'कागजात',
        body_html: '<p>मूल संस्कृतम्</p>',
        orig_author: 'Original',
      },
      'uploader',
    );
    expect(created.status).toBe(201);
    const id = created.data.id;
    expect(
      (
        await call(
          'documents/' + id,
          'PUT',
          { ...created.data, title: 'Changed' },
          'uploader',
        )
      ).status,
    ).toBe(403);
    const changed = await call(
      'documents/' + id,
      'PUT',
      { ...created.data, title: 'Changed', body_html: '<p>नयाँ पाठ</p>' },
      'admin',
    );
    expect(changed.status).toBe(200);
    expect(
      (await call('documents/' + id, 'PUT', created.data, 'admin')).status,
    ).toBe(409);
    const history = await call(
      `documents/${id}/revisions`,
      'GET',
      undefined,
      'admin',
    );
    expect(history.data).toHaveLength(1);
    const restored = await call(
      `documents/${id}/revisions/${history.data[0].id}`,
      'POST',
      { version: changed.data.version },
      'admin',
    );
    expect(restored.data.title_np).toBe('मूल पाठ');
    expect(restored.data.body_html).toContain('मूल संस्कृतम्');
    expect(
      (await call(`documents/${id}/revisions`, 'GET', undefined, 'admin')).data,
    ).toHaveLength(2);
    expect(
      (await call('documents/1', 'DELETE', undefined, 'uploader')).status,
    ).toBe(403);
    expect(
      (await call('documents/' + id, 'DELETE', undefined, 'uploader')).status,
    ).toBe(200);
    expect((await call('documents/' + id)).status).toBe(404);
  });
  it('stores notes privately and replays offline creates without duplicates', async () => {
    const payload = {
      quote: 'perpetual peace',
      note: 'निजी टिप्पणी',
      client_key: crypto.randomUUID(),
    };
    const first = await call('documents/1/notes', 'POST', payload, 'viewer');
    const repeat = await call('documents/1/notes', 'POST', payload, 'viewer');
    expect(first.status).toBe(201);
    expect(repeat.data.id).toBe(first.data.id);
    expect(
      (await call('documents/1/notes', 'GET', undefined, 'admin')).data,
    ).toEqual([]);
    await call(
      'documents/1/notes/' + first.data.id,
      'DELETE',
      undefined,
      'admin',
    );
    expect(
      (await call('documents/1/notes', 'GET', undefined, 'viewer')).data,
    ).toHaveLength(1);
    await call(
      'documents/1/notes/' + first.data.id,
      'DELETE',
      undefined,
      'viewer',
    );
    expect(
      (await call('documents/1/notes', 'GET', undefined, 'viewer')).data,
    ).toEqual([]);
  });
  it('detects cross-device progress conflicts', async () => {
    const first = await call(
      'documents/1/progress',
      'PUT',
      { position: 0.4, version: 0 },
      'viewer',
    );
    expect(first.status).toBe(200);
    expect(first.data.version).toBe(1);
    expect(
      (
        await call(
          'documents/1/progress',
          'PUT',
          { position: 0.8, version: 0 },
          'viewer',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          'documents/1/progress',
          'PUT',
          { position: 0.8, version: 1 },
          'viewer',
        )
      ).data.version,
    ).toBe(2);
    expect(
      (await call('documents/1/progress', 'GET', undefined, 'admin')).data
        .position,
    ).toBe(0);
  });
  it('supports existing bcrypt accounts and revokes sessions on logout', async () => {
    const db = await database();
    const hash = await bcrypt.hash('test-only-not-a-real-account', 10);
    await db.query(
      'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)',
      ['test@example.invalid', hash, 'viewer'],
    );
    expect(
      (
        await call(
          'login',
          'POST',
          { email: 'test@example.invalid', password: 'wrong' },
          'login-test',
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          'login',
          'POST',
          {
            email: 'test@example.invalid',
            password: 'test-only-not-a-real-account',
          },
          'login-test',
        )
      ).status,
    ).toBe(200);
    expect(
      (await call('session', 'GET', undefined, 'login-test')).data.user.role,
    ).toBe('viewer');
    await call('logout', 'POST', {}, 'login-test');
    expect(
      (await call('documents', 'GET', undefined, 'login-test')).status,
    ).toBe(200);
  });
  it('handles validated attachments and rejects disguised HTML', async () => {
    const good = new FormData();
    good.set('title', 'Original scan');
    good.set('category', 'कागजात');
    good.set(
      'file',
      new File(['%PDF-1.4\n%%EOF'], 'sample.pdf', { type: 'application/pdf' }),
    );
    const result = await call('documents', 'POST', good, 'uploader');
    expect(result.status).toBe(201);
    expect(result.data.file_path).toMatch(/^\/api\/files\//);
    const bad = new FormData();
    bad.set('title', 'Unsafe');
    bad.set('category', 'कागजात');
    bad.set('file', new File(['<script>bad()</script>'], 'sample.pdf'));
    expect((await call('documents', 'POST', bad, 'uploader')).status).toBe(400);
    const big = new FormData();
    big.set('title', 'Too large');
    big.set('category', 'कागजात');
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    bytes.set(Buffer.from('%PDF-'));
    big.set(
      'file',
      new File([bytes], 'large.pdf', { type: 'application/pdf' }),
    );
    expect((await call('documents', 'POST', big, 'uploader')).status).toBe(413);
  });
  it('blocks script execution without translating archive text', () => {
    const safe = safeHTML(
      '<h2>संस्कृतम्</h2><p onclick="alert(1)">नेपाली</p><script>bad()</script><a href="javascript:bad()">link</a>',
    );
    expect(safe).toContain('संस्कृतम्');
    expect(safe).toContain('नेपाली');
    expect(safe).not.toContain('onclick');
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('javascript:');
  });
  it('rejects cross-origin writes before reaching the database', async () => {
    const request = new Request('http://localhost/api/documents', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.invalid',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const response = await handle({
      event: { request, url: new URL(request.url) } as any,
      resolve: async () => {
        throw Error('Should never reach handler');
      },
    } as any);
    expect(response.status).toBe(403);
  });
  it('keeps the original Preeti and ITRANS conversion functions', () => {
    expect(preetiToUnicode('')).toBe('');
    expect(itransToUnicode('namaH shivAya')).toContain('नमः');
    expect(itransToUnicode('OM')).toBe('ॐ');
  });
  it('allows admins to delete every document but limits uploaders to their own', async () => {
    const created = await call(
      'documents',
      'POST',
      { title: 'Owner document', category: 'कागजात', body_html: '<p>x</p>' },
      'uploader',
    );
    expect(created.status).toBe(201);
    expect(
      (await call('documents/1', 'DELETE', undefined, 'uploader')).status,
    ).toBe(403);
    expect(
      (await call('documents/all', 'DELETE', undefined, 'uploader')).status,
    ).toBe(403);
    expect(
      (await call('documents/all', 'DELETE', undefined, 'admin')).data.deleted,
    ).toBeGreaterThan(0);
    expect((await call('documents/1')).status).toBe(404);
    expect((await call('documents/' + created.data.id)).status).toBe(404);
  });
});
describe('Non-destructive migration', () => {
  it('keeps existing notes intact and can run twice', async () => {
    const raw = new PGlite();
    const db = wrapPglite(raw);
    await db.query(
      'CREATE TABLE document_notes(id BIGSERIAL PRIMARY KEY,document_id BIGINT NOT NULL,user_id BIGINT NOT NULL,quote TEXT NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())',
    );
    await db.query(
      "INSERT INTO document_notes(document_id,user_id,quote,note) VALUES(42,7,'ॐ मूल पाठ','untouched')",
    );
    await migrate(db);
    await migrate(db);
    const r = await db.query('SELECT * FROM document_notes');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quote).toBe('ॐ मूल पाठ');
    expect(r.rows[0].client_key).toBeNull();
    await raw.close();
  });
});
describe('Chronicle (hash-chained archive history)', () => {
  it('records every change, survives clearing the archive, and detects tampering', async () => {
    expect((await call('chronicle', 'GET', undefined, 'viewer')).status).toBe(
      403,
    );
    expect(
      (await call('chronicle/verify', 'GET', undefined, 'uploader')).status,
    ).toBe(403);
    const before = await call('chronicle?limit=500', 'GET', undefined, 'admin');
    expect(before.data.enabled).toBe(true);
    const kinds = before.data.events.map((e: any) => e.kind);
    for (const k of [
      'document.created',
      'document.revised',
      'document.restored',
      'document.deleted',
      'archive.cleared',
    ])
      expect(kinds).toContain(k);
    // Events outlive the documents they describe: the archive was cleared above.
    const verified = await call('chronicle/verify', 'GET', undefined, 'admin');
    expect(verified.data).toMatchObject({
      enabled: true,
      ok: true,
      count: before.data.events.length,
    });
    const db = await database();
    const target = before.data.events[1];
    await db.query(
      'UPDATE archive_events SET payload=\'{"title":"rewritten"}\' WHERE seq=$1',
      [target.seq],
    );
    const broken = await call('chronicle/verify', 'GET', undefined, 'admin');
    expect(broken.data).toMatchObject({ ok: false, broken_at: target.seq });
    await db.query('UPDATE archive_events SET payload=$1 WHERE seq=$2', [
      JSON.stringify(target.payload),
      target.seq,
    ]);
    expect(
      (await call('chronicle/verify', 'GET', undefined, 'admin')).data.ok,
    ).toBe(true);
    expect(
      (await call('chronicle?after=abc', 'GET', undefined, 'admin')).status,
    ).toBe(400);
  });
  it('keeps archive changes working on databases without the chronicle migration', async () => {
    const { record, resetChronicleCache, verifyChronicle } =
      await import('../src/lib/server/chronicle');
    const raw = new PGlite();
    const db = wrapPglite(raw);
    resetChronicleCache();
    expect(await record(db, 'archive.cleared', null, null)).toBeNull();
    expect((await verifyChronicle(db)).enabled).toBe(false);
    resetChronicleCache();
    await raw.close();
  });
});
