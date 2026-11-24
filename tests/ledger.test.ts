import { beforeAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { migrate, wrapPglite, type DB } from '../src/lib/server/db';
import {
  saveDocument,
  deleteDocument,
  deleteAllDocuments,
  restoreDocument,
  version,
  getDocument,
} from '../src/lib/server/archive';
import {
  listEvents,
  verifyLedger,
  canonical,
  record,
} from '../src/lib/server/ledger';
import { exportArchive, BACKUP_FORMAT } from '../src/lib/server/backup';
import type { User } from '../src/lib/types';

let db: DB;
const admin = { id: '1', email: 'a@x.invalid', role: 'admin' } as User;
const uploader = { id: '2', email: 'u@x.invalid', role: 'uploader' } as User;
const doc = (title: string) => ({
  title,
  category: 'कागजात',
  body_html: '<p>ॐ नमः शिवाय — original text</p>',
});

beforeAll(async () => {
  db = wrapPglite(new PGlite());
  await migrate(db);
  const hash = await bcrypt.hash('x', 4);
  await db.query(
    "INSERT INTO users(email,password_hash,role) VALUES('a@x.invalid',$1,'admin'),('u@x.invalid',$1,'uploader')",
    [hash],
  );
});

describe('Archive ledger', () => {
  it('records every change in a verifiable chain', async () => {
    const a = await saveDocument(db, doc('पहिलो'), uploader);
    const current = await getDocument(db, a.id);
    await saveDocument(
      db,
      { ...doc('पहिलो (edited)'), version: version(current) },
      admin,
      a.id,
    );
    const rev = await db.query(
      'SELECT id::text FROM document_revisions WHERE document_id=$1',
      [a.id],
    );
    await restoreDocument(
      db,
      a.id,
      rev.rows[0].id,
      version(await getDocument(db, a.id)),
      admin,
    );
    await deleteDocument(db, a.id, uploader);
    const { events } = await listEvents(db);
    expect(events.map((e) => e.kind).reverse()).toEqual([
      'document.created',
      'document.edited',
      'document.restored',
      'document.deleted',
    ]);
    // A deleted document's content survives in the ledger, Devanagari untouched.
    expect((events[0].payload.before as any).title).toBe('पहिलो');
    expect((events[0].payload.before as any).body_html).toContain(
      'ॐ नमः शिवाय',
    );
    const v = await verifyLedger(db);
    expect(v).toMatchObject({ ok: true, count: 4 });
    expect(v.head).toBe(events[0].hash);
  });
  it('detects tampering with any past event', async () => {
    const before = await verifyLedger(db);
    await db.query(
      "UPDATE archive_events SET payload=jsonb_set(payload,'{after,title}','\"forged\"') WHERE seq=2",
    );
    const broken = await verifyLedger(db);
    expect(broken.ok).toBe(false);
    expect(broken.brokenAt).toBe('2');
    await db.query(
      "UPDATE archive_events SET payload=jsonb_set(payload,'{after,title}','\"पहिलो (edited)\"') WHERE seq=2",
    );
    expect(await verifyLedger(db)).toEqual(before);
  });
  it('keeps one chain under concurrent writers', async () => {
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        saveDocument(db, doc('concurrent ' + n), uploader),
      ),
    );
    expect((await verifyLedger(db)).ok).toBe(true);
  });
  it('exports a portable backup without private reader data', async () => {
    await db.query(
      "INSERT INTO document_notes(document_id,user_id,quote,note) VALUES(1,1,'q','private')",
    );
    const backup = await exportArchive(db);
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.migrations).toEqual(['001-platform', '002-ledger']);
    expect(backup.ledger.ok).toBe(true);
    expect(backup.documents).toHaveLength(4);
    expect(backup.events.at(-1)!.hash).toBe(backup.ledger.head);
    const text = JSON.stringify(backup);
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('private');
  });
  it('records a full archive clear document by document', async () => {
    const r = await deleteAllDocuments(db, admin);
    const { events } = await listEvents(db, { limit: 5 });
    expect(events[0]).toMatchObject({
      kind: 'archive.cleared',
      payload: { count: r.count },
    });
    expect(events.slice(1, 5).every((e) => e.kind === 'document.deleted')).toBe(
      true,
    );
    expect((await verifyLedger(db)).ok).toBe(true);
  });
  it('hashes canonically regardless of key order', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 'ॐ' }] })).toBe(
      canonical({ a: [{ c: 'ॐ', d: 2 }], b: 1 }),
    );
  });
  it('lets archive writes continue on a database that has not been migrated yet', async () => {
    const raw = new PGlite();
    const old = wrapPglite(raw);
    expect(
      await old.transaction((tx) =>
        record(tx, 'archive.cleared', null, null, {}, old),
      ),
    ).toBeNull();
    expect((await verifyLedger(old)).available).toBe(false);
    await raw.close();
  });
});
