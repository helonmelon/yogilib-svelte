import { createHash } from 'node:crypto';
import type { DB } from './db';

/**
 * The archive ledger: an append-only, hash-chained log of every change to the
 * shared archive. Each event commits to the previous one, so altering or
 * removing any past event breaks verification from that point on.
 *
 * The documents table is the current state; the ledger is the history that
 * explains how the archive reached it.
 */
export type EventKind =
  | 'document.created'
  | 'document.edited'
  | 'document.restored'
  | 'document.deleted'
  | 'archive.cleared';

export interface LedgerEvent {
  seq: string;
  kind: EventKind;
  document_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export const GENESIS = '0'.repeat(64);

/** Stable JSON: object keys sorted so the same value always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const o = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
      .join(',') +
    '}'
  );
}

export function eventHash(e: {
  kind: string;
  document_id: string | null;
  actor_id: string | null;
  payload: unknown;
  prev_hash: string;
}) {
  return createHash('sha256')
    .update(
      canonical([
        e.prev_hash,
        e.kind,
        e.document_id ?? null,
        e.actor_id ?? null,
        e.payload,
      ]),
    )
    .digest('hex');
}

// External databases only get the ledger table after an explicit `npm run db:migrate`.
// Until then, archive writes keep working and simply are not recorded.
const present = new WeakMap<object, boolean>();
export async function ledgerAvailable(db: DB, key: object = db) {
  if (!present.get(key)) {
    const r = await db.query<{ t: string | null }>(
      "SELECT to_regclass('archive_events')::text AS t",
    );
    present.set(key, Boolean(r.rows[0]?.t));
  }
  return present.get(key)!;
}

/** Appends one event. Must run inside the transaction that makes the change. */
export async function record(
  tx: DB,
  kind: EventKind,
  documentId: string | null,
  actorId: string | null,
  payload: Record<string, unknown>,
  root: object,
) {
  if (!(await ledgerAvailable(tx, root))) return null;
  // Serialise appends so two writers never extend the chain from the same head.
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('yogilib-ledger'))");
  const head = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const prev_hash = head.rows[0]?.hash ?? GENESIS;
  const clean = JSON.parse(JSON.stringify(payload));
  const hash = eventHash({
    kind,
    document_id: documentId,
    actor_id: actorId,
    payload: clean,
    prev_hash,
  });
  await tx.query(
    'INSERT INTO archive_events(kind,document_id,actor_id,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6)',
    [kind, documentId, actorId, JSON.stringify(clean), prev_hash, hash],
  );
  return hash;
}

function eventRow(r: Record<string, any>): LedgerEvent {
  return {
    seq: String(r.seq),
    kind: r.kind,
    document_id: r.document_id == null ? null : String(r.document_id),
    actor_id: r.actor_id == null ? null : String(r.actor_id),
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    prev_hash: r.prev_hash,
    hash: r.hash,
    created_at: new Date(r.created_at).toISOString(),
  };
}

export async function listEvents(
  db: DB,
  opts: { documentId?: string; before?: number; limit?: number } = {},
) {
  if (!(await ledgerAvailable(db)))
    return { available: false, events: [] as LedgerEvent[] };
  const params: any[] = [];
  const where: string[] = [];
  if (opts.documentId) {
    params.push(opts.documentId);
    where.push(`document_id=$${params.length}`);
  }
  if (opts.before) {
    params.push(opts.before);
    where.push(`seq<$${params.length}`);
  }
  params.push(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  const { rows } = await db.query(
    `SELECT seq,kind,document_id,actor_id,payload,prev_hash,hash,created_at FROM archive_events${
      where.length ? ' WHERE ' + where.join(' AND ') : ''
    } ORDER BY seq DESC LIMIT $${params.length}`,
    params,
  );
  return { available: true, events: rows.map(eventRow) };
}

/** Recomputes the whole chain. Reports the first broken link, if any. */
export async function verifyLedger(db: DB) {
  if (!(await ledgerAvailable(db)))
    return { available: false, ok: true, count: 0, head: GENESIS };
  let prev = GENESIS;
  let count = 0;
  let after = 0;
  for (;;) {
    const { rows } = await db.query(
      'SELECT seq,kind,document_id,actor_id,payload,prev_hash,hash,created_at FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT 500',
      [after],
    );
    if (!rows.length) break;
    for (const raw of rows) {
      const e = eventRow(raw);
      if (e.prev_hash !== prev || eventHash(e) !== e.hash)
        return {
          available: true,
          ok: false,
          count,
          head: prev,
          brokenAt: e.seq,
        };
      prev = e.hash;
      count++;
      after = Number(e.seq);
    }
  }
  return { available: true, ok: true, count, head: prev };
}
