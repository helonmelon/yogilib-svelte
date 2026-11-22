// The archive journal: an append-only, hash-chained log of every change to the
// shared archive, in the spirit of an event-sourced system. Each entry commits
// to the one before it, so any later edit or removal of history is detectable,
// and a deleted document keeps its final snapshot so it can be recovered.
import { createHash } from 'node:crypto';
import type { DB } from './db';
import { Failure, documentRow, fields, version } from './archive';
import type { User } from '../types';

export const GENESIS = '0'.repeat(64);
export type JournalAction =
  'create' | 'edit' | 'restore' | 'delete' | 'recover';
export type JournalSummary = {
  title: string;
  title_np: string;
  category: string;
  version: string;
  bulk?: boolean;
};
export type Change = {
  seq: string;
  at: string;
  action: JournalAction;
  document_id: string;
  title: string;
  title_np: string;
  category: string;
  recoverable: boolean;
};

// The journal table arrives with migration 002. External databases only get
// it after an explicit, reviewed `npm run db:migrate`; until then archive
// changes keep working and are simply not journaled.
let known = false;
export async function journalEnabled(db: DB) {
  if (known) return true;
  const r = await db.query<{ t: string | null }>(
    "SELECT to_regclass('archive_journal')::text AS t",
  );
  return (known = Boolean(r.rows[0]?.t));
}

export function chainHash(
  prev: string,
  entry: string,
  snapshot: string | null,
) {
  return createHash('sha256')
    .update(prev + '\n' + entry + '\n' + (snapshot ?? ''))
    .digest('hex');
}

export function summarize(
  row: Record<string, any>,
  bulk = false,
): JournalSummary {
  return {
    title: String(row.title ?? ''),
    title_np: String(row.title_np ?? ''),
    category: String(row.category ?? ''),
    version: version(row),
    ...(bulk ? { bulk } : {}),
  };
}

// Must run inside the same transaction as the change it records.
export async function record(
  tx: DB,
  action: JournalAction,
  row: Record<string, any>,
  actor: User | null,
  options: { snapshot?: boolean; bulk?: boolean } = {},
) {
  if (!(await journalEnabled(tx))) return;
  // Serialize writers so the chain never forks, on Postgres and PGlite alike.
  await tx.query('SELECT pg_advisory_xact_lock(7140101)');
  const last = await tx.query<{ hash: string }>(
    'SELECT hash FROM archive_journal ORDER BY seq DESC LIMIT 1',
  );
  const prev = last.rows[0]?.hash ?? GENESIS;
  const at = new Date().toISOString();
  const documentId = String(row.id);
  const entry = JSON.stringify({
    at,
    action,
    document_id: documentId,
    actor: actor ? String(actor.id) : null,
    summary: summarize(row, options.bulk),
  });
  const snapshot = options.snapshot
    ? JSON.stringify({ id: documentId, ...pick(row) })
    : null;
  await tx.query(
    'INSERT INTO archive_journal(at,action,document_id,actor,entry,snapshot,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      at,
      action,
      documentId,
      actor?.id ?? null,
      entry,
      snapshot,
      prev,
      chainHash(prev, entry, snapshot),
    ],
  );
}

function pick(row: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const k of [...fields, 'uploaded_by', 'created_at'])
    out[k] = String(row[k] ?? '');
  return out;
}

// Public "recent changes": titles and actions only, never who made them.
export async function recentChanges(db: DB, before?: string, limit = 50) {
  if (!(await journalEnabled(db)))
    return { enabled: false, changes: [] as Change[] };
  if (before !== undefined && !/^\d+$/.test(before))
    throw new Failure(400, 'Invalid page');
  const params: any[] = [limit];
  if (before) params.push(before);
  const r = await db.query(
    `SELECT j.seq::text AS seq,j.action,j.document_id::text AS document_id,j.entry,
       (j.action='delete' AND j.snapshot IS NOT NULL AND d.id IS NULL AND NOT EXISTS (SELECT 1 FROM archive_journal k WHERE k.document_id=j.document_id AND k.seq>j.seq)) AS recoverable
     FROM archive_journal j LEFT JOIN documents d ON d.id=j.document_id
     ${before ? 'WHERE j.seq<$2' : ''} ORDER BY j.seq DESC LIMIT $1`,
    params,
  );
  return {
    enabled: true,
    changes: r.rows.map((x): Change => {
      const e = JSON.parse(x.entry);
      return {
        seq: x.seq,
        at: e.at,
        action: x.action,
        document_id: x.document_id,
        title: e.summary.title,
        title_np: e.summary.title_np,
        category: e.summary.category,
        recoverable: Boolean(x.recoverable),
      };
    }),
  };
}

// Walk the whole chain and recompute every hash.
export async function verifyJournal(db: DB) {
  if (!(await journalEnabled(db)))
    return { enabled: false, ok: true, count: 0, head: GENESIS };
  let prev = GENESIS;
  let count = 0;
  let after = '0';
  while (true) {
    const r = await db.query(
      'SELECT seq::text AS seq,action,document_id::text AS document_id,entry,snapshot,prev_hash,hash FROM archive_journal WHERE seq>$1 ORDER BY seq LIMIT 500',
      [after],
    );
    if (!r.rows.length) break;
    for (const x of r.rows) {
      let consistent = false;
      try {
        const e = JSON.parse(x.entry);
        consistent = e.action === x.action && e.document_id === x.document_id;
      } catch {}
      if (
        !consistent ||
        x.prev_hash !== prev ||
        x.hash !== chainHash(prev, x.entry, x.snapshot)
      )
        return { enabled: true, ok: false, count, head: prev, brokenAt: x.seq };
      prev = x.hash;
      count++;
      after = x.seq;
    }
  }
  return { enabled: true, ok: true, count, head: prev };
}

// Bring a deleted document back from its final journaled snapshot, under its
// original ID so existing links keep working. The original file, if any, was
// removed from storage at deletion and is not restored.
export async function recoverDocument(db: DB, seq: string, user: User) {
  if (user.role !== 'admin') throw new Failure(403, 'Forbidden');
  if (!/^\d+$/.test(seq)) throw new Failure(404, 'Journal entry not found');
  if (!(await journalEnabled(db)))
    throw new Failure(404, 'Journal entry not found');
  return db.transaction(async (tx) => {
    const r = await tx.query(
      "SELECT j.document_id::text AS document_id,j.snapshot FROM archive_journal j WHERE j.seq=$1 AND j.action='delete' AND j.snapshot IS NOT NULL AND NOT EXISTS (SELECT 1 FROM archive_journal k WHERE k.document_id=j.document_id AND k.seq>j.seq)",
      [seq],
    );
    // Only a document's most recent deletion can be recovered, so an older
    // snapshot never silently replaces later history.
    if (!r.rows.length) throw new Failure(404, 'Journal entry not found');
    const s = JSON.parse(r.rows[0].snapshot);
    const exists = await tx.query('SELECT 1 FROM documents WHERE id=$1', [
      s.id,
    ]);
    if (exists.rows.length)
      throw new Failure(409, 'This document already exists.');
    const keys = ['id', ...fields, 'uploaded_by', 'created_at', 'file_path'];
    const values = [
      s.id,
      ...fields.map((k) => s[k] ?? ''),
      /^\d+$/.test(s.uploaded_by) ? s.uploaded_by : null,
      s.created_at || new Date().toISOString(),
      '',
    ];
    const inserted = await tx.query(
      `INSERT INTO documents(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      values,
    );
    await record(tx, 'recover', inserted.rows[0], user);
    return documentRow(inserted.rows[0]);
  });
}
