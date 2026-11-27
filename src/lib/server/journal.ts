// Append-only archive journal.
//
// Borrowed from Urbit's event-log design: the archive's history is a sequence of
// events, each one hashed together with the hash of the event before it. The current
// tables are a fast view of that history; the journal is what lets a deleted or
// overwritten document be recovered and lets anyone verify that nothing was quietly
// rewritten. Journal rows are only ever inserted, never updated or deleted.
import { createHash } from 'node:crypto';
import type { DB } from './db';

export type EventKind =
  | 'document.created'
  | 'document.updated'
  | 'document.restored'
  | 'document.deleted';

export type ArchiveEvent = {
  id: string;
  at: string;
  actor_id: string | null;
  kind: EventKind;
  document_id: string | null;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
};

export const GENESIS = '0'.repeat(64);

// Stable JSON: object keys sorted, so the same content always hashes the same way
// regardless of how Postgres returned the JSONB.
export function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
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
  e: Pick<ArchiveEvent, 'kind' | 'document_id' | 'actor_id' | 'payload'>,
) {
  return createHash('sha256')
    .update(
      prev +
        '\n' +
        canonical({
          kind: e.kind,
          document_id: e.document_id ?? null,
          actor_id: e.actor_id ?? null,
          payload: e.payload,
        }),
    )
    .digest('hex');
}

// Values that JSONB cannot store or would reshape (bigint ids, Dates) become strings.
function plain(row: Record<string, any>) {
  return JSON.parse(
    JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? String(v) : v)),
  );
}

let available = false;
let checkedAt = 0;
export function resetJournalCache() {
  available = false;
  checkedAt = 0;
}
// External databases only gain the journal after an explicit, reviewed migration.
// Until then archive writes keep working and simply are not journaled; a missing
// table is re-checked once a minute so a migrated server starts journaling itself.
async function hasJournal(db: DB) {
  if (available || Date.now() - checkedAt < 60_000) return available;
  checkedAt = Date.now();
  const r = await db.query<{ t: string | null }>(
    "SELECT to_regclass('archive_events')::text AS t",
  );
  available = Boolean(r.rows[0]?.t);
  if (!available)
    console.warn(
      'archive_events table missing: run the reviewed 002-journal migration to enable the archive journal.',
    );
  return available;
}

// Must be called inside the same transaction as the change it records.
export async function record(
  tx: DB,
  kind: EventKind,
  documentId: string | null,
  actorId: string | null,
  payload: Record<string, any>,
) {
  if (!(await hasJournal(tx))) return null;
  // Serialise writers so the chain never forks.
  await tx.query('LOCK TABLE archive_events IN EXCLUSIVE MODE');
  const last = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY id DESC LIMIT 1',
  );
  const prev = last.rows[0]?.hash ?? GENESIS;
  const body = {
    kind,
    document_id: documentId,
    actor_id: actorId,
    payload: plain(payload),
  };
  const hash = eventHash(prev, body);
  await tx.query(
    'INSERT INTO archive_events(actor_id,kind,document_id,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6)',
    [actorId, kind, documentId, JSON.stringify(body.payload), prev, hash],
  );
  return hash;
}

function eventRow(r: Record<string, any>): ArchiveEvent {
  return {
    id: String(r.id),
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    actor_id: r.actor_id == null ? null : String(r.actor_id),
    kind: r.kind,
    document_id: r.document_id == null ? null : String(r.document_id),
    payload: r.payload,
    prev_hash: r.prev_hash,
    hash: r.hash,
  };
}

export async function listEvents(
  db: DB,
  {
    documentId,
    before,
    limit = 50,
  }: { documentId?: string; before?: string; limit?: number } = {},
) {
  if (!(await hasJournal(db))) return { events: [], enabled: false };
  const params: any[] = [];
  const where: string[] = [];
  if (documentId) {
    params.push(documentId);
    where.push(`document_id=$${params.length}`);
  }
  if (before) {
    params.push(before);
    where.push(`id<$${params.length}`);
  }
  params.push(Math.min(Math.max(limit, 1), 200));
  const { rows } = await db.query(
    'SELECT * FROM archive_events' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ` ORDER BY id DESC LIMIT $${params.length}`,
    params,
  );
  return { events: rows.map(eventRow), enabled: true };
}

// Walks the whole chain in batches and reports the first broken link, if any.
export async function verifyJournal(db: DB) {
  if (!(await hasJournal(db)))
    return { enabled: false, ok: true, count: 0, head: GENESIS };
  let prev = GENESIS;
  let after = '0';
  let count = 0;
  while (true) {
    const { rows } = await db.query(
      'SELECT * FROM archive_events WHERE id>$1 ORDER BY id LIMIT 500',
      [after],
    );
    if (!rows.length) break;
    for (const raw of rows) {
      const e = eventRow(raw);
      if (e.prev_hash !== prev || eventHash(prev, e) !== e.hash)
        return { enabled: true, ok: false, count, head: prev, brokenAt: e.id };
      prev = e.hash;
      after = e.id;
      count++;
    }
  }
  return { enabled: true, ok: true, count, head: prev };
}

// Latest tombstone of a deleted document ({ document, revisions }), for recovery.
export async function deletedSnapshot(
  db: DB,
  documentId: string,
): Promise<{ document: Record<string, any>; revisions?: any[] } | null> {
  if (!(await hasJournal(db))) return null;
  const { rows } = await db.query(
    "SELECT payload FROM archive_events WHERE document_id=$1 AND kind='document.deleted' ORDER BY id DESC LIMIT 1",
    [documentId],
  );
  return rows[0]?.payload?.document ? rows[0].payload : null;
}
