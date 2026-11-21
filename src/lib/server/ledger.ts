import { createHash } from 'node:crypto';
import type { DB } from './db';

/**
 * The archive ledger: an append-only, hash-chained log of every change to the
 * shared archive. Each event commits to the one before it, so any later edit,
 * deletion or reordering of history is detectable by `verifyLedger`.
 *
 * Writes run inside the caller's transaction, so an event exists exactly when
 * its change was committed. Production databases gain the table only through
 * an explicit `npm run db:migrate`; until then recording is skipped.
 */
export type LedgerKind =
  | 'document.create'
  | 'document.update'
  | 'document.restore'
  | 'document.delete'
  | 'archive.delete-all';
export type LedgerEvent = {
  seq: string;
  kind: LedgerKind;
  document_id: string | null;
  actor_id: string | null;
  payload: Record<string, any>;
  recorded_at: string;
  prev_hash: string;
  hash: string;
};
export const GENESIS = '0'.repeat(64);
const LOCK = 7_101_001;
const enabled = new WeakMap<DB, Promise<boolean>>();

/** Stable JSON: object keys sorted so the same value always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value as object)
      .sort()
      .filter((k) => (value as any)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical((value as any)[k]))
      .join(',') +
    '}'
  );
}
export function eventHash(
  e: Pick<
    LedgerEvent,
    | 'kind'
    | 'document_id'
    | 'actor_id'
    | 'payload'
    | 'recorded_at'
    | 'prev_hash'
  >,
) {
  return createHash('sha256')
    .update(
      canonical({
        kind: e.kind,
        document_id: e.document_id,
        actor_id: e.actor_id,
        payload: e.payload,
        recorded_at: e.recorded_at,
        prev_hash: e.prev_hash,
      }),
    )
    .digest('hex');
}
/**
 * Whether the ledger migration has been applied. Call on the root connection
 * before opening a transaction: a failed probe must never abort a write.
 */
export function ledgerEnabled(db: DB) {
  let ready = enabled.get(db);
  if (!ready) {
    ready = db
      .query(`SELECT 1 FROM yogilib_migrations WHERE name='002-ledger'`)
      .then((r) => r.rows.length > 0)
      .catch(() => false);
    enabled.set(db, ready);
  }
  return ready;
}
export function forgetLedgerState(db: DB) {
  enabled.delete(db);
}
/** Appends one event. `tx` must be an open transaction; `on` comes from `ledgerEnabled`. */
export async function record(
  tx: DB,
  on: boolean,
  kind: LedgerKind,
  documentId: string | null,
  actorId: string | null,
  payload: Record<string, any>,
) {
  if (!on) return null;
  await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
  const head = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const event = {
    kind,
    document_id: documentId,
    actor_id: actorId,
    payload: JSON.parse(JSON.stringify(payload)),
    recorded_at: new Date().toISOString(),
    prev_hash: head.rows[0]?.hash ?? GENESIS,
  };
  const hash = eventHash(event);
  await tx.query(
    'INSERT INTO archive_events(kind,document_id,actor_id,payload,recorded_at,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      kind,
      documentId,
      actorId,
      JSON.stringify(event.payload),
      event.recorded_at,
      event.prev_hash,
      hash,
    ],
  );
  return hash;
}
/** The stored (unsanitized) state of a document, as kept in the ledger. */
export function documentState(
  row: Record<string, any>,
  fields: string[],
  version: string,
) {
  const state: Record<string, string> = { version };
  for (const k of [...fields, 'file_path', 'uploaded_by', 'created_at'])
    state[k] = String(row[k] ?? '');
  return state;
}
function rowEvent(r: Record<string, any>): LedgerEvent {
  return {
    ...r,
    seq: String(r.seq),
    document_id: r.document_id == null ? null : String(r.document_id),
    actor_id: r.actor_id == null ? null : String(r.actor_id),
  } as LedgerEvent;
}
/** Walks the whole chain in pages and reports the first broken link, if any. */
export async function verifyLedger(db: DB) {
  if (!(await ledgerEnabled(db)))
    return { enabled: false, ok: true, events: 0, head: GENESIS };
  let prev = GENESIS;
  let after = '0';
  let events = 0;
  for (;;) {
    const { rows } = await db.query(
      'SELECT * FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT 500',
      [after],
    );
    if (!rows.length) break;
    for (const raw of rows) {
      const e = rowEvent(raw);
      if (e.prev_hash !== prev || eventHash(e) !== e.hash)
        return {
          enabled: true,
          ok: false,
          events,
          head: prev,
          broken_at: e.seq,
        };
      prev = e.hash;
      after = e.seq;
      events++;
    }
  }
  return { enabled: true, ok: true, events, head: prev };
}
export async function documentHistory(db: DB, id: string) {
  if (!(await ledgerEnabled(db))) return [];
  const { rows } = await db.query(
    `SELECT seq,kind,document_id,actor_id,recorded_at,hash,payload->>'version' AS version,payload->>'title' AS title FROM archive_events WHERE document_id=$1 ORDER BY seq DESC LIMIT 200`,
    [id],
  );
  return rows.map((r) => ({
    ...r,
    seq: String(r.seq),
    document_id: String(r.document_id),
    actor_id: r.actor_id == null ? null : String(r.actor_id),
  }));
}
