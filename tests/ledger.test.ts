import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { migrate, wrapPglite, type DB } from '../src/lib/server/db';
import {
  saveDocument,
  deleteDocument,
  restoreDocument,
  deleteAllDocuments,
} from '../src/lib/server/archive';
import {
  verifyLedger,
  verifyChain,
  events,
  replay,
  canonical,
  ledgerEnabled,
  forgetLedgerState,
  recentEvents,
  type LedgerEvent,
} from '../src/lib/server/ledger';
import type { User } from '../src/lib/types';

const admin: User = { id: '1', email: 'a@x.invalid', role: 'admin' };
const uploader: User = { id: '2', email: 'u@x.invalid', role: 'uploader' };
const doc = (title: string) => ({
  title,
  category: 'कागजात',
  body_html: '<p>सुगौली सन्धि — ' + title + '</p>',
});
async function all(db: DB) {
  const list: LedgerEvent[] = [];
  for await (const e of events(db, 2)) list.push(e);
  return list;
}
let db: DB;
beforeAll(async () => {
  db = wrapPglite(new PGlite());
  await migrate(db);
});

describe('archive ledger', () => {
  it('canonical JSON ignores key order and keeps Devanagari intact', () => {
    expect(canonical({ b: 1, a: { d: 'देव', c: [2, null] } })).toBe(
      '{"a":{"c":[2,null],"d":"देव"},"b":1}',
    );
  });

  it('journals every archive change in one verifiable chain', async () => {
    const a = await saveDocument(db, doc('पहिलो'), uploader);
    const b = await saveDocument(db, doc('दोस्रो'), admin);
    const edited = await saveDocument(
      db,
      { ...doc('पहिलो (सम्पादित)'), version: a.version },
      admin,
      a.id,
    );
    const { rows } = await db.query(
      'SELECT id::text FROM document_revisions WHERE document_id=$1',
      [a.id],
    );
    await restoreDocument(db, a.id, rows[0].id, edited.version, admin.id);
    await deleteDocument(db, b.id, admin);

    const list = await all(db);
    expect(list.map((e) => e.kind)).toEqual([
      'create',
      'create',
      'update',
      'restore',
      'delete',
    ]);
    expect(list[0].actor).toBe('2');
    const v = await verifyLedger(db);
    expect(v).toMatchObject({ enabled: true, ok: true, count: 5 });
    expect(v.head).toBe(list[4].hash);

    // Replaying the log reproduces the live archive exactly.
    const state = replay(list);
    expect([...state.keys()]).toEqual([a.id]);
    const live = await db.query('SELECT * FROM documents WHERE id=$1', [a.id]);
    expect(state.get(a.id)?.title).toBe('पहिलो');
    expect(state.get(a.id)?.body_html).toBe(live.rows[0].body_html);

    const recent = await recentEvents(db, 2);
    expect(recent[0]).toMatchObject({ kind: 'delete' });
    expect(recent[1]).not.toHaveProperty('payload');
  });

  it('does not journal changes that roll back', async () => {
    const before = (await verifyLedger(db)).count;
    await expect(
      saveDocument(db, { ...doc('x'), version: 'stale' }, admin, '1'),
    ).rejects.toThrow();
    expect((await verifyLedger(db)).count).toBe(before);
  });

  it('detects edited history and broken links', async () => {
    const list = await all(db);
    const tampered = list.map((e) => ({ ...e }));
    tampered[1] = {
      ...tampered[1],
      payload: {
        document: { ...tampered[1].payload.document, title: 'नक्कली' },
      },
    };
    expect(await verifyChain(tampered)).toMatchObject({
      ok: false,
      broken_at: list[1].seq,
      reason: 'hash',
    });
    expect(await verifyChain(list.filter((_, i) => i !== 2))).toMatchObject({
      ok: false,
      reason: 'link',
    });
    await db.query(
      `UPDATE archive_events SET payload=jsonb_set(payload,'{document,title}','"नक्कली"') WHERE seq=$1`,
      [list[0].seq],
    );
    expect(await verifyLedger(db)).toMatchObject({ ok: false, reason: 'hash' });
  });

  it('records bulk deletion', async () => {
    const fresh = wrapPglite(new PGlite());
    await migrate(fresh);
    await saveDocument(fresh, doc('क'), admin);
    await deleteAllDocuments(fresh, admin);
    const list = await all(fresh);
    expect(list.at(-1)).toMatchObject({
      kind: 'delete-all',
      payload: { count: 1 },
    });
    expect(replay(list).size).toBe(0);
  });

  it('stays silent on databases where the ledger migration was not applied', async () => {
    const legacy = wrapPglite(new PGlite());
    await migrate(legacy);
    await legacy.query(
      "DELETE FROM yogilib_migrations WHERE name='002-ledger'",
    );
    forgetLedgerState(legacy);
    expect(await ledgerEnabled(legacy)).toBe(false);
    await saveDocument(legacy, doc('ख'), admin);
    expect(
      (await legacy.query('SELECT count(*)::int AS n FROM archive_events'))
        .rows[0].n,
    ).toBe(0);
    expect(await verifyLedger(legacy)).toMatchObject({ enabled: false });
  });
});
