// The archive journal: an append-only, hash-chained log of every change to the
// shared archive. Borrowed from Urbit's event-log idea: the log is the record,
// tables are a cache that can be rebuilt by replaying it, and nothing in the
// log is ever rewritten. Private data (notes, reading positions, accounts) is
// never journaled.
import { createHash } from 'node:crypto';
import type { DB } from './db';
import { fields } from './archive';

export const GENESIS = '0'.repeat(64);
export type EventKind =
  'create' | 'update' | 'restore' | 'delete' | 'delete_all';
export type ArchiveEvent = {
  seq: string;
  kind: EventKind;
  document_id: string | null;
  actor_id: string | null;
  payload: Record<string, any>;
  at: string;
  prev_hash: string;
  hash: string;
};

/** JSON with sorted object keys, so a hash never depends on key order. */
export function canonical(value: any): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}

export function eventHash(
  prev: string,
  e: Pick<ArchiveEvent, 'kind' | 'document_id' | 'actor_id' | 'payload' | 'at'>,
) {
  return createHash('sha256')
    .update(
      prev +
        canonical({
          kind: e.kind,
          document_id: e.document_id,
          actor_id: e.actor_id,
          payload: e.payload,
          at: e.at,
        }),
    )
    .digest('hex');
}

/** The journaled form of a document: its original fields, untranslated and unsanitized. */
export function documentPayload(row: Record<string, any>) {
  const p: Record<string, string> = {};
  for (const k of [...fields, 'file_path', 'uploaded_by', 'created_at'])
    p[k] = String(row[k] ?? '');
  return p;
}

/** Appends one event. Must run inside the transaction that makes the change. */
export async function record(
  tx: DB,
  kind: EventKind,
  documentId: string | null,
  actorId: string | null,
  payload: Record<string, any>,
) {
  // One writer at a time keeps the chain linear.
  await tx.query('LOCK TABLE archive_events IN EXCLUSIVE MODE');
  const head = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const prev = head.rows[0]?.hash ?? GENESIS;
  const event = {
    kind,
    document_id: documentId,
    actor_id: actorId,
    payload,
    at: new Date().toISOString(),
  };
  const hash = eventHash(prev, event);
  await tx.query(
    'INSERT INTO archive_events(kind,document_id,actor_id,payload,at,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [kind, documentId, actorId, JSON.stringify(payload), event.at, prev, hash],
  );
  return hash;
}

function eventRow(r: Record<string, any>): ArchiveEvent {
  return {
    seq: String(r.seq),
    kind: r.kind,
    document_id: r.document_id == null ? null : String(r.document_id),
    actor_id: r.actor_id == null ? null : String(r.actor_id),
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    at: r.at,
    prev_hash: r.prev_hash,
    hash: r.hash,
  };
}

export async function readEvents(db: DB, after = 0, limit = 100) {
  const { rows } = await db.query(
    'SELECT * FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT $2',
    [after, limit],
  );
  return rows.map(eventRow);
}

export async function journalHead(db: DB) {
  const { rows } = await db.query(
    'SELECT seq,hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  return rows.length
    ? { seq: String(rows[0].seq), hash: String(rows[0].hash) }
    : { seq: '0', hash: GENESIS };
}

/** Walks the whole chain in pages and reports the first broken link, if any. */
export async function verifyJournal(db: DB) {
  let prev = GENESIS;
  let after = 0;
  let count = 0;
  while (true) {
    const page = await readEvents(db, after, 500);
    for (const e of page) {
      if (e.prev_hash !== prev || eventHash(prev, e) !== e.hash)
        return { ok: false, count, broken_at: e.seq, head: prev };
      prev = e.hash;
      count++;
      after = Number(e.seq);
    }
    if (page.length < 500) return { ok: true, count, head: prev };
  }
}

/**
 * Pure fold of events into archive state: state = replay(snapshot, events).
 * Given the same snapshot and events it always yields the same documents.
 */
export function replay(
  events: Pick<ArchiveEvent, 'kind' | 'document_id' | 'payload'>[],
  start: Map<string, Record<string, string>> = new Map(),
) {
  const state = new Map(start);
  for (const e of events) {
    if (e.kind === 'delete_all') state.clear();
    else if (e.kind === 'delete') state.delete(String(e.document_id));
    else {
      const { revision: _revision, ...doc } = e.payload;
      state.set(String(e.document_id), doc);
    }
  }
  return state;
}

export const EXPORT_FORMAT = 'yogilib-archive/1';

/**
 * A portable, self-describing copy of the shared archive: every document as
 * stored (original HTML and Devanagari untouched), its revision history, and
 * the journal head it corresponds to. Accounts, sessions, private notes and
 * reading positions are deliberately left out. Originals are referenced by
 * file_path and must be copied from storage separately.
 */
export async function exportArchive(db: DB) {
  return db.transaction(async (tx) => {
    const documents = await tx.query('SELECT * FROM documents ORDER BY id');
    const revisions = await tx.query(
      'SELECT id::text,document_id::text,snapshot,created_at FROM document_revisions ORDER BY id',
    );
    const events = await tx.query<{ count: string }>(
      'SELECT count(*) FROM archive_events',
    );
    return {
      format: EXPORT_FORMAT,
      exported_at: new Date().toISOString(),
      journal: {
        ...(await journalHead(tx)),
        events: Number(events.rows[0].count),
      },
      documents: documents.rows.map((r) => ({
        id: String(r.id),
        ...documentPayload(r),
      })),
      revisions: revisions.rows,
    };
  });
}
