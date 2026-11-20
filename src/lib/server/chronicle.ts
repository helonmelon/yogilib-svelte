// The chronicle: an append-only, hash-chained record of every change to the archive.
//
// Borrowed from Urbit's event log: state is the product of an ordered list of events,
// and each event commits to everything before it. Yogilib still stores documents as
// ordinary rows, but the chronicle lets anyone holding a copy prove the archive's
// history was never silently rewritten, and is the seed of a future replayable log.
import { createHash } from 'node:crypto';
import type { DB } from './db';

export const GENESIS = '0'.repeat(64);
export type EventKind =
  | 'document.created'
  | 'document.revised'
  | 'document.restored'
  | 'document.deleted'
  | 'archive.cleared';
export type ChronicleEvent = {
  seq: string;
  at: string;
  actor: string | null;
  kind: EventKind;
  document_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
};

/** Deterministic JSON: object keys sorted at every depth. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value as object)
        .sort()
        .filter((k) => (value as any)[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + canonical((value as any)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value ?? null);
}

export function eventHash(
  e: Pick<
    ChronicleEvent,
    'at' | 'actor' | 'kind' | 'document_id' | 'payload' | 'prev_hash'
  >,
) {
  return createHash('sha256')
    .update(
      canonical([
        e.prev_hash,
        e.at,
        e.actor ?? null,
        e.kind,
        e.document_id ?? null,
        e.payload,
      ]),
    )
    .digest('hex');
}

// External databases only gain the table after an explicit, reviewed migration.
// Until then, archive changes keep working and simply are not chronicled.
let present: { value: boolean; checked: number } | undefined;
export function resetChronicleCache() {
  present = undefined;
}
async function available(db: DB) {
  if (present?.value || (present && Date.now() - present.checked < 60_000))
    return present.value;
  const r = await db.query<{ t: string | null }>(
    "SELECT to_regclass('archive_events')::text AS t",
  );
  present = { value: Boolean(r.rows[0]?.t), checked: Date.now() };
  return present.value;
}

/** Appends one event. Call inside the same transaction as the change it records. */
export async function record(
  tx: DB,
  kind: EventKind,
  actor: string | null,
  documentId: string | null,
  payload: Record<string, unknown> = {},
) {
  if (!(await available(tx))) return null;
  // One writer at a time extends the chain; the lock is released at commit/rollback.
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('yogilib-chronicle'))");
  const head = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const event = {
    at: new Date().toISOString(),
    actor,
    kind,
    document_id: documentId,
    payload: JSON.parse(JSON.stringify(payload)),
    prev_hash: head.rows[0]?.hash ?? GENESIS,
  };
  const hash = eventHash(event);
  await tx.query(
    'INSERT INTO archive_events(at,actor,kind,document_id,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      event.at,
      actor,
      kind,
      documentId,
      JSON.stringify(event.payload),
      event.prev_hash,
      hash,
    ],
  );
  return hash;
}

function eventRow(r: Record<string, any>): ChronicleEvent {
  return {
    ...r,
    seq: String(r.seq),
    actor: r.actor == null ? null : String(r.actor),
    document_id: r.document_id == null ? null : String(r.document_id),
  } as ChronicleEvent;
}

export async function listEvents(
  db: DB,
  { after = 0, documentId = '', limit = 100 } = {},
) {
  if (!(await available(db))) return { events: [], enabled: false };
  const params: any[] = [after];
  let where = 'seq>$1';
  if (documentId) {
    params.push(documentId);
    where += ' AND document_id=$2';
  }
  params.push(Math.min(Math.max(limit, 1), 500));
  const r = await db.query(
    `SELECT * FROM archive_events WHERE ${where} ORDER BY seq LIMIT $${params.length}`,
    params,
  );
  return { events: r.rows.map(eventRow), enabled: true };
}

/** Recomputes every hash from genesis. Reports the first event that does not fit. */
export async function verifyChronicle(db: DB) {
  if (!(await available(db)))
    return { enabled: false, ok: true, count: 0, head: GENESIS };
  let prev = GENESIS;
  let count = 0;
  let after = 0;
  while (true) {
    const r = await db.query(
      'SELECT * FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT 1000',
      [after],
    );
    if (!r.rows.length) break;
    for (const row of r.rows.map(eventRow)) {
      if (row.prev_hash !== prev || eventHash(row) !== row.hash)
        return {
          enabled: true,
          ok: false,
          count,
          head: prev,
          broken_at: row.seq,
        };
      prev = row.hash;
      count++;
      after = Number(row.seq);
    }
  }
  return { enabled: true, ok: true, count, head: prev };
}
