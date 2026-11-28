/**
 * The ledger: an append-only, hash-chained log of every archive mutation.
 *
 * Borrowed from Urbit's Arvo, where the whole system state is a pure function of an
 * ordered event log. Here the documents table stays the fast "current state", while the
 * ledger is the durable source of history: each event's hash covers the previous hash, so
 * tampering or loss is detectable, and the log can be exported as plain NDJSON and replayed
 * on any future runtime (including a bare-Linux build) without this codebase's database.
 */
import { createHash } from 'node:crypto';
import type { DB } from './db';
import type { User } from '../types';
import { fields } from './archive-fields';

export type LedgerKind =
  | 'document.create'
  | 'document.update'
  | 'document.restore'
  | 'document.delete'
  | 'archive.delete-all';

export type LedgerEvent = {
  seq: string;
  prev_hash: string;
  hash: string;
  kind: LedgerKind;
  actor_id: string;
  document_id: string | null;
  payload: unknown;
  created_at: string;
};

export const GENESIS = '0'.repeat(64);
const LOCK_KEY = 7_202_611; // advisory lock id serialising ledger appends

/** Deterministic JSON: object keys sorted recursively so hashes survive JSONB round-trips. */
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

export function eventHash(e: Omit<LedgerEvent, 'hash'>) {
  return createHash('sha256')
    .update(
      canonical({
        seq: String(e.seq),
        prev_hash: e.prev_hash,
        kind: e.kind,
        actor_id: e.actor_id,
        document_id: e.document_id,
        payload: e.payload,
        created_at: e.created_at,
      }),
    )
    .digest('hex');
}

/** A portable, string-only snapshot of a document row (stable across pg/PGlite drivers). */
export function snapshot(row: Record<string, any>) {
  const s: Record<string, string> = { id: String(row.id) };
  for (const k of [...fields, 'file_path', 'uploaded_by', 'created_at'])
    s[k] = String(row[k] ?? '');
  return s;
}

const present = new WeakMap<DB, boolean>();
/** The ledger is skipped (not fatal) on an external database that has not run 002-ledger yet. */
async function enabled(db: DB, root: DB) {
  if (!present.has(root)) {
    const r = await db.query<{ t: string | null }>(
      "SELECT to_regclass('archive_events')::text AS t",
    );
    present.set(root, Boolean(r.rows[0]?.t));
    if (!present.get(root))
      console.warn(
        'Ledger disabled: run the reviewed 002-ledger migration to enable it.',
      );
  }
  return present.get(root)!;
}

/** Appends one event inside the caller's transaction. */
export async function record(
  tx: DB,
  root: DB,
  kind: LedgerKind,
  actor: User,
  documentId: string | null,
  payload: unknown,
) {
  if (!(await enabled(tx, root))) return null;
  await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
  const head = await tx.query<{ seq: string; hash: string }>(
    'SELECT seq::text, hash FROM archive_events ORDER BY seq DESC LIMIT 1',
  );
  const e: Omit<LedgerEvent, 'hash'> = {
    seq: String(BigInt(head.rows[0]?.seq ?? '0') + 1n),
    prev_hash: head.rows[0]?.hash ?? GENESIS,
    kind,
    actor_id: String(actor.id),
    document_id: documentId,
    payload: JSON.parse(canonical(payload)),
    created_at: new Date().toISOString(),
  };
  const hash = eventHash(e);
  await tx.query(
    'INSERT INTO archive_events(seq,prev_hash,hash,kind,actor_id,document_id,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      e.seq,
      e.prev_hash,
      hash,
      e.kind,
      e.actor_id,
      e.document_id,
      canonical(e.payload),
      e.created_at,
    ],
  );
  return { ...e, hash } as LedgerEvent;
}

function rowEvent(r: Record<string, any>): LedgerEvent {
  return {
    seq: String(r.seq),
    prev_hash: r.prev_hash,
    hash: r.hash,
    kind: r.kind,
    actor_id: r.actor_id,
    document_id: r.document_id ?? null,
    payload: r.payload,
    created_at: r.created_at,
  };
}

export async function listEvents(
  db: DB,
  opts: { document?: string; before?: string; limit?: number } = {},
) {
  if (!(await enabled(db, db))) return [];
  const params: any[] = [];
  const where: string[] = [];
  if (opts.document) {
    params.push(opts.document);
    where.push(`document_id=$${params.length}`);
  }
  if (opts.before) {
    params.push(opts.before);
    where.push(`seq<$${params.length}`);
  }
  params.push(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  const r = await db.query(
    `SELECT * FROM archive_events${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT $${params.length}`,
    params,
  );
  return r.rows.map(rowEvent);
}

/** Streams the whole log oldest-first in pages, so verification and export use bounded memory. */
export async function* allEvents(db: DB, page = 500) {
  if (!(await enabled(db, db))) return;
  let after = '0';
  while (true) {
    const r = await db.query(
      'SELECT * FROM archive_events WHERE seq>$1 ORDER BY seq LIMIT $2',
      [after, page],
    );
    for (const row of r.rows) yield rowEvent(row);
    if (r.rows.length < page) return;
    after = String(r.rows[r.rows.length - 1].seq);
  }
}

export type Verification =
  | { ok: true; events: number; head: string }
  | { ok: false; events: number; brokenAt: string; reason: string };

/** Checks every hash and link; works on the database or on an exported NDJSON stream. */
export async function verifyEvents(
  events: AsyncIterable<LedgerEvent> | Iterable<LedgerEvent>,
): Promise<Verification> {
  let prev = GENESIS;
  let expected = 1n;
  let count = 0;
  for await (const e of events as AsyncIterable<LedgerEvent>) {
    const fail = (reason: string): Verification => ({
      ok: false,
      events: count,
      brokenAt: String(e.seq),
      reason,
    });
    if (BigInt(e.seq) !== expected) return fail('Sequence gap');
    if (e.prev_hash !== prev) return fail('Broken link to previous event');
    if (eventHash(e) !== e.hash)
      return fail('Event content does not match its hash');
    prev = e.hash;
    expected++;
    count++;
  }
  return { ok: true, events: count, head: prev };
}

/**
 * Pure replay: folds the log into the set of live documents, keyed by id. This is the
 * Arvo idea in miniature — state is derived from events — and is what a future runtime
 * would use to rebuild an archive from an export.
 */
export function replay(events: Iterable<LedgerEvent>) {
  const state = new Map<string, Record<string, string>>();
  for (const e of events) {
    const p = e.payload as any;
    if (e.kind === 'archive.delete-all') state.clear();
    else if (e.kind === 'document.delete') state.delete(String(e.document_id));
    else if (p?.after) state.set(String(e.document_id), p.after);
  }
  return state;
}
