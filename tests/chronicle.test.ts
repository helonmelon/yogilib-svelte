import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate, wrapPglite, type DB } from '../src/lib/server/db';
import {
  saveDocument,
  deleteDocument,
  deleteAllDocuments,
  restoreDocument,
  documentRow,
  getDocument,
} from '../src/lib/server/archive';
import {
  canonical,
  readChronicle,
  replay,
  sealArchive,
  verifyChronicle,
  GENESIS,
} from '../src/lib/server/chronicle';
import type { User } from '../src/lib/types';

const doc = (title: string) => ({
  title,
  title_np: 'नेपाली शीर्षक',
  category: 'कागजात',
  description: 'A test record',
  body_html: '<p>योग — yoga</p>',
});
let db: DB;
let admin: User;
let uploader: User;
async function users(d: DB) {
  const ids: Record<string, string> = {};
  for (const role of ['admin', 'uploader']) {
    const r = await d.query(
      "INSERT INTO users(email,password_hash,role) VALUES($1,'x',$2) RETURNING id::text AS id",
      [`${role}@chronicle.invalid`, role],
    );
    ids[role] = r.rows[0].id;
  }
  admin = { id: ids.admin, email: 'admin@chronicle.invalid', role: 'admin' };
  uploader = {
    id: ids.uploader,
    email: 'uploader@chronicle.invalid',
    role: 'uploader',
  };
}
beforeEach(async () => {
  db = wrapPglite(new PGlite());
  await migrate(db);
  await users(db);
});

describe('archive chronicle', () => {
  it('canonicalises key order', () => {
    expect(canonical({ b: 1, a: { d: [1, 'x'], c: null } })).toBe(
      canonical({ a: { c: null, d: [1, 'x'] }, b: 1 }),
    );
  });

  it('records every change as a linked chain that replays to the live archive', async () => {
    const created = await saveDocument(db, doc('First'), uploader);
    const edited = await saveDocument(
      db,
      { ...doc('First, revised'), version: created.version },
      admin,
      created.id,
    );
    const revision = await db.query(
      'SELECT id::text AS id FROM document_revisions WHERE document_id=$1',
      [created.id],
    );
    await restoreDocument(
      db,
      created.id,
      revision.rows[0].id,
      edited.version,
      admin.id,
    );
    const second = await saveDocument(db, doc('Second'), uploader);
    await deleteDocument(db, second.id, uploader);

    const entries = await readChronicle(db);
    expect(entries.map((e) => e.kind)).toEqual([
      'document.create',
      'document.update',
      'document.restore',
      'document.create',
      'document.delete',
    ]);
    expect(entries[0].prev_hash).toBe(GENESIS);
    for (let i = 1; i < entries.length; i++)
      expect(entries[i].prev_hash).toBe(entries[i - 1].hash);
    // Devanagari survives byte-for-byte in the log.
    expect(JSON.parse(entries[0].payload).state.title_np).toBe('नेपाली शीर्षक');

    const result = await verifyChronicle(db);
    expect(result).toMatchObject({
      enabled: true,
      ok: true,
      count: 5,
      drift: [],
    });
    expect(result.head).toBe(entries[4].hash);
    const rebuilt = replay(entries);
    expect([...rebuilt.keys()]).toEqual([created.id]);
    expect(rebuilt.get(created.id)?.title).toBe('First');
  });

  it('keeps the full text of deleted documents', async () => {
    const a = await saveDocument(db, doc('Kept in history'), uploader);
    await saveDocument(db, doc('Also kept'), uploader);
    const removed = await deleteAllDocuments(db, admin);
    expect(removed.count).toBe(2);
    expect((await db.query('SELECT 1 FROM documents')).rows).toHaveLength(0);
    const entries = await readChronicle(db);
    expect(entries.at(-1)?.kind).toBe('archive.delete_all');
    const deleted = entries.filter((e) => e.kind === 'document.delete');
    expect(deleted.map((e) => JSON.parse(e.payload).state.title)).toEqual([
      'Kept in history',
      'Also kept',
    ]);
    expect(deleted[0].document_id).toBe(a.id);
    expect((await verifyChronicle(db)).ok).toBe(true);
  });

  it('detects edited history and edits made outside the chronicle', async () => {
    const a = await saveDocument(db, doc('Original'), uploader);
    await saveDocument(db, doc('Another'), uploader);
    await db.query(
      "UPDATE archive_chronicle SET payload=replace(payload,'Original','Forged') WHERE seq=1",
    );
    expect(await verifyChronicle(db)).toMatchObject({
      ok: false,
      brokenAt: '1',
    });

    const clean = wrapPglite(new PGlite());
    await migrate(clean);
    await users(clean);
    const b = await saveDocument(clean, doc('Original'), uploader);
    await clean.query("UPDATE documents SET title='Silent edit' WHERE id=$1", [
      b.id,
    ]);
    expect(await verifyChronicle(clean)).toMatchObject({
      ok: false,
      brokenAt: null,
      drift: [b.id],
    });
    expect(a.id).toBe(b.id);
  });

  it('orders sequence numbers numerically past ten entries', async () => {
    for (let i = 0; i < 12; i++)
      await saveDocument(db, doc('Doc ' + i), uploader);
    const entries = await readChronicle(db);
    expect(entries.map((e) => e.seq)).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    );
    expect(await verifyChronicle(db)).toMatchObject({ ok: true, count: 12 });
  });

  it('rolls back the chronicle entry with a failed change', async () => {
    const a = await saveDocument(db, doc('Stable'), uploader);
    await expect(
      saveDocument(db, { ...doc('Stale'), version: 'old' }, admin, a.id),
    ).rejects.toThrow(/changed/);
    expect(await readChronicle(db)).toHaveLength(1);
  });

  it('seals documents that predate the chronicle, once', async () => {
    const old = wrapPglite(new PGlite());
    const platform = await readFile('migrations/001-platform.sql', 'utf8');
    for (const s of platform.split(';')) if (s.trim()) await old.query(s);
    await users(old);
    // Without migration 002 changes still work and nothing is recorded.
    const a = await saveDocument(old, doc('Before the chronicle'), uploader);
    expect((await verifyChronicle(old)).enabled).toBe(false);
    expect(await sealArchive(old, admin.id)).toEqual({ sealed: 0 });

    await migrate(old);
    expect((await verifyChronicle(old)).drift).toEqual([a.id]);
    expect(await sealArchive(old, admin.id)).toEqual({ sealed: 1 });
    expect(await sealArchive(old, admin.id)).toEqual({ sealed: 0 });
    expect(await verifyChronicle(old)).toMatchObject({ ok: true, count: 1 });
    expect(documentRow(await getDocument(old, a.id)).title).toBe(
      'Before the chronicle',
    );
  });
});
