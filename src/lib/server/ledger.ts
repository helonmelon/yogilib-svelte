// The ledger: an append-only, hash-chained journal of every change to the shared archive.
// Inspired by Urbit's event log — the archive's state is a fold over its history, and that
// history can be verified, exported and replayed on any machine without trusting the server.
import { createHash } from 'node:crypto';
import type { DB } from './db';
import { fields } from './archive';

export const GENESIS = '0'.repeat(64);
export type EventKind =
  'create' | 'update' | 'restore' | 'delete' | 'delete-all';
export type LedgerEvent = {
  seq: number;
  at: string;
  actor: string | null;
  kind: EventKind;
  document_id: string | null;
  payload: Record<string, any>;
  prev_hash: string;
  hash: string;
};

/** Deterministic JSON: object keys sorted at every depth, so the hash never depends on key order. */
export function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value ?? null);
}

export function eventHash(e: Omit<LedgerEvent, 'seq' | 'hash'>) {
  return createHash('sha256')
    .update(
      canonical({
        at: e.at,
        actor: e.actor,
        kind: e.kind,
        document_id: e.document_id,
        payload: e.payload,
        prev_hash: e.prev_hash,
      }),
    )
    .digest('hex');
}

/** The archive-facing part of a document row: what an event must carry to be replayable. */
export function documentState(row: Record<string, any>) {
  const d: Record<string, string> = {};
  for (const k of [...fields, 'file_path', 'uploaded_by', 'created_at'])
    d[k] = String(row[k] ?? '');
  return d;
}

const enabledCache = new WeakMap<DB, Promise<boolean>>();
/** External databases only journal after `002-ledger` has been explicitly migrated. */
export function ledgerEnabled(db: DB, via: DB = db) {
  let p = enabledCache.get(db);
  if (!p) {
    p = via
      .query("SELECT 1 FROM yogilib_migrations WHERE name='002-ledger'")
      .then((r) => r.rows.length > 0)
      .catch(() => false);
    enabledCache.set(db, p);
  }
  return p;
}
export function forgetLedgerState(db: DB) {
  enabledCache.delete(db);
}

/**
 * Append one event. Call inside the same transaction as the change it describes, so the
 * change and its record commit or roll back together. `root` is the non-transactional
 * handle under which the (once-per-process) migration check is cached.
 */
export async function record(
  tx: DB,
  root: DB,
  kind: EventKind,
  actor: string | null,
  documentId: string | null,
  payload: Record<string, any>,
) {
  // Look up through `tx`: PGlite blocks other queries while a transaction is open.
  if (!(await ledgerEnabled(root, tx))) return null;
  // Serialise appends so each event links to exactly one predecessor.
  await tx.query('SELECT pg_advisory_xact_lock(7106)');
  const head = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const event = {
    at: new Date().toISOString(),
    actor: actor ? String(actor) : null,
    kind,
    document_id: documentId ? String(documentId) : null,
    payload,
    prev_hash: head.rows[0]?.hash ?? GENESIS,
  };
  const hash = eventHash(event);
  await tx.query(
    'INSERT INTO archive_events(at,actor,kind,document_id,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      event.at,
      event.actor,
      kind,
      event.document_id,
      JSON.stringify(payload),
      event.prev_hash,
      hash,
    ],
  );
  return hash;
}

function eventRow(r: Record<string, any>): LedgerEvent {
  return {
    seq: Number(r.seq),
    at: r.at,
    actor: r.actor == null ? null : String(r.actor),
    kind: r.kind,
    document_id: r.document_id == null ? null : String(r.document_id),
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    prev_hash: r.prev_hash,
    hash: r.hash,
  };
}

/** Read events in order, in pages, so verification and export never hold the whole log in memory. */
export async function* events(db: DB, pageSize = 200) {
  let after = 0;
  while (true) {
    const { rows } = await db.query(
      'SELECT * FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT $2',
      [after, pageSize],
    );
    if (!rows.length) return;
    for (const r of rows) yield eventRow(r);
    after = Number(rows[rows.length - 1].seq);
  }
}

export type Verification = {
  enabled: boolean;
  ok: boolean;
  count: number;
  head: string;
  broken_at?: number;
  reason?: string;
};

/** Check every link and every hash, from genesis to head. */
export async function verifyChain(
  source: AsyncIterable<LedgerEvent> | Iterable<LedgerEvent>,
): Promise<Omit<Verification, 'enabled'>> {
  let prev = GENESIS;
  let count = 0;
  for await (const e of source as AsyncIterable<LedgerEvent>) {
    if (e.prev_hash !== prev)
      return { ok: false, count, head: prev, broken_at: e.seq, reason: 'link' };
    if (eventHash(e) !== e.hash)
      return { ok: false, count, head: prev, broken_at: e.seq, reason: 'hash' };
    prev = e.hash;
    count++;
  }
  return { ok: true, count, head: prev };
}

export async function verifyLedger(db: DB): Promise<Verification> {
  if (!(await ledgerEnabled(db)))
    return { enabled: false, ok: true, count: 0, head: GENESIS };
  return { enabled: true, ...(await verifyChain(events(db))) };
}

/**
 * Pure replay: fold the events into the archive state they describe. Documents that existed
 * before the ledger began only appear once they are next changed.
 */
export function replay(list: Iterable<LedgerEvent>) {
  const state = new Map<string, Record<string, string>>();
  for (const e of list) {
    if (e.kind === 'delete-all') state.clear();
    else if (e.kind === 'delete') state.delete(String(e.document_id));
    else state.set(String(e.document_id), { ...e.payload.document });
  }
  return state;
}

export async function recentEvents(db: DB, limit = 50) {
  if (!(await ledgerEnabled(db))) return [];
  const { rows } = await db.query(
    'SELECT * FROM archive_events ORDER BY seq DESC LIMIT $1',
    [limit],
  );
  // Summaries only: titles, not full bodies, for the dashboard.
  return rows.map(eventRow).map((e) => ({
    seq: e.seq,
    at: e.at,
    actor: e.actor,
    kind: e.kind,
    document_id: e.document_id,
    title: e.payload.document?.title ?? '',
    count: e.payload.count,
    hash: e.hash,
  }));
}
