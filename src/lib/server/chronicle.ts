// The archive chronicle: an append-only, hash-chained event log.
//
// Borrowed from Urbit's design: the event log is the source of truth and the
// archive tables are a cache that can be rebuilt by replaying it. Every entry
// commits to the hash of the entry before it, so an edit to history anywhere
// breaks verification from that point on.
import { createHash } from 'node:crypto';
import type { DB } from './db';
import { fields } from './archive-fields';

export const GENESIS = '0'.repeat(64);
// Single advisory-lock key that serializes appends so the chain never forks.
const LOCK = 7_413_009;

export type ChronicleKind =
  | 'document.snapshot'
  | 'document.create'
  | 'document.update'
  | 'document.restore'
  | 'document.delete'
  | 'archive.delete_all';

export interface ChronicleEntry {
  seq: string;
  at: string;
  actor_id: string;
  kind: ChronicleKind;
  document_id: string;
  payload: string;
  prev_hash: string;
  hash: string;
}

/** Stable JSON: object keys sorted, so the same value always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((k) => (value as any)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical((value as any)[k]))
      .join(',') +
    '}'
  );
}

export function entryHash(e: Omit<ChronicleEntry, 'hash'>) {
  return createHash('sha256')
    .update(
      [
        e.prev_hash,
        e.seq,
        e.at,
        e.kind,
        e.actor_id,
        e.document_id,
        e.payload,
      ].join('\n'),
    )
    .digest('hex');
}

/** The archived fields of a document row, as strings, for a payload. */
export function documentState(row: Record<string, any>) {
  const state: Record<string, string> = {};
  for (const k of [...fields, 'file_path', 'uploaded_by', 'created_at'])
    state[k] = String(row[k] ?? '');
  return state;
}

const present = new WeakMap<DB, boolean>();
/** True once migration 002 has been applied. External databases may not have it yet. */
export async function chronicleEnabled(db: DB) {
  if (present.get(db)) return true;
  const r = await db.query<{ t: string | null }>(
    "SELECT to_regclass('archive_chronicle')::text AS t",
  );
  const ok = !!r.rows[0]?.t;
  if (ok) present.set(db, true);
  return ok;
}

/**
 * Appends one entry. Call inside the same transaction as the change it records,
 * so the archive and its chronicle commit or roll back together.
 */
export async function record(
  tx: DB,
  kind: ChronicleKind,
  documentId: string | null,
  actorId: string | null,
  payload: Record<string, unknown>,
  enabled?: boolean,
) {
  if (!(enabled ?? (await chronicleEnabled(tx)))) return null;
  await tx.query(`SELECT pg_advisory_xact_lock(${LOCK})`);
  const head = await tx.query<{ seq: string; hash: string }>(
    'SELECT seq::text AS seq, hash FROM archive_chronicle c ORDER BY c.seq DESC LIMIT 1',
  );
  const entry: Omit<ChronicleEntry, 'hash'> = {
    seq: String(Number(head.rows[0]?.seq ?? 0) + 1),
    at: new Date().toISOString(),
    actor_id: actorId ? String(actorId) : '',
    kind,
    document_id: documentId ? String(documentId) : '',
    payload: canonical(payload),
    prev_hash: head.rows[0]?.hash ?? GENESIS,
  };
  const hash = entryHash(entry);
  await tx.query(
    'INSERT INTO archive_chronicle(seq,at,actor_id,kind,document_id,payload,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      entry.seq,
      entry.at,
      entry.actor_id || null,
      entry.kind,
      entry.document_id || null,
      entry.payload,
      entry.prev_hash,
      hash,
    ],
  );
  return { ...entry, hash };
}

const columns =
  "seq::text AS seq, at, COALESCE(actor_id::text,'') AS actor_id, kind, COALESCE(document_id::text,'') AS document_id, payload, prev_hash, hash";

export async function readChronicle(db: DB, after = 0, limit = 500) {
  const r = await db.query<ChronicleEntry>(
    `SELECT ${columns} FROM archive_chronicle c WHERE c.seq>$1 ORDER BY c.seq LIMIT $2`,
    [after, limit],
  );
  return r.rows;
}

/** Newest-first summary for the dashboard, without full document bodies. */
export async function recentChronicle(db: DB, before?: number, limit = 30) {
  const r = await db.query<ChronicleEntry & { email: string | null }>(
    "SELECT c.seq::text AS seq, c.at, COALESCE(c.actor_id::text,'') AS actor_id, c.kind, COALESCE(c.document_id::text,'') AS document_id, c.payload, c.prev_hash, c.hash, u.email FROM archive_chronicle c LEFT JOIN users u ON u.id=c.actor_id" +
      (before ? ' WHERE c.seq<$2' : '') +
      ' ORDER BY c.seq DESC LIMIT $1',
    before ? [limit, before] : [limit],
  );
  return r.rows.map(({ payload, ...e }) => {
    let title = '';
    try {
      const p = JSON.parse(payload);
      title = String(p.state?.title ?? p.title ?? '');
    } catch {}
    return { ...e, actor: e.email || '', title };
  });
}

/**
 * Rebuilds archive state from events alone (state = f(log)).
 * Returns a map of document id to its archived fields.
 */
export function replay(entries: ChronicleEntry[]) {
  const docs = new Map<string, Record<string, string>>();
  for (const e of entries) {
    const p = JSON.parse(e.payload);
    if (e.kind === 'archive.delete_all') docs.clear();
    else if (e.kind === 'document.delete') docs.delete(e.document_id);
    else docs.set(e.document_id, p.state);
  }
  return docs;
}

/**
 * Walks the whole chain, checks every link, then replays it and compares the
 * result with the live archive tables.
 */
export async function verifyChronicle(db: DB) {
  if (!(await chronicleEnabled(db)))
    return {
      enabled: false,
      ok: false,
      count: 0,
      head: GENESIS,
      brokenAt: null,
      drift: [],
    };
  let prev = GENESIS;
  let expected = 1;
  let brokenAt: string | null = null;
  const all: ChronicleEntry[] = [];
  for (let after = 0; ;) {
    const batch = await readChronicle(db, after);
    if (!batch.length) break;
    for (const e of batch) {
      if (
        !brokenAt &&
        (e.prev_hash !== prev ||
          Number(e.seq) !== expected ||
          entryHash(e) !== e.hash)
      )
        brokenAt = e.seq;
      prev = e.hash;
      expected++;
      all.push(e);
    }
    after = Number(batch[batch.length - 1].seq);
  }
  const rebuilt = replay(all);
  const live = await db.query('SELECT * FROM documents');
  const drift: string[] = [];
  for (const row of live.rows) {
    const id = String(row.id);
    const state = rebuilt.get(id);
    if (!state || canonical(state) !== canonical(documentState(row)))
      drift.push(id);
    rebuilt.delete(id);
  }
  drift.push(...rebuilt.keys());
  return {
    enabled: true,
    ok: !brokenAt && !drift.length,
    count: all.length,
    head: prev,
    brokenAt,
    drift: drift.sort((a, b) => Number(a) - Number(b)),
  };
}

/**
 * Records a snapshot for every document the chronicle has never seen, e.g.
 * documents that existed before migration 002. Safe to run repeatedly.
 */
export async function sealArchive(db: DB, actorId: string | null) {
  if (!(await chronicleEnabled(db))) return { sealed: 0 };
  return db.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(${LOCK})`);
    const { rows } = await tx.query(
      'SELECT d.* FROM documents d WHERE NOT EXISTS (SELECT 1 FROM archive_chronicle c WHERE c.document_id=d.id) ORDER BY d.id',
    );
    for (const row of rows)
      await record(
        tx,
        'document.snapshot',
        String(row.id),
        actorId,
        {
          state: documentState(row),
        },
        true,
      );
    return { sealed: rows.length };
  });
}
