import { createHash } from 'node:crypto';
import type { DB } from './db';
import { fields } from './archive';

/**
 * Time capsule: a portable, self-verifying snapshot of the shared archive.
 *
 * Inspired by Urbit's event log, every entry is hashed together with the
 * previous entry's hash, so the final `root` commits to the whole archive in
 * order. Anyone holding a capsule can verify it offline with no server and no
 * database (see `npm run capsule:verify`). Private data — accounts, password
 * hashes, sessions, private notes and reading positions — is never included.
 */
export const CAPSULE_FORMAT = 'yogilib-capsule/1';
const GENESIS = '0'.repeat(64);

export type CapsuleEntry = {
  kind: 'document' | 'revision';
  id: string;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
};
export type Capsule = {
  format: typeof CAPSULE_FORMAT;
  created_at: string;
  counts: { documents: number; revisions: number };
  entries: CapsuleEntry[];
  root: string;
};

/** JSON with sorted object keys, so equal data always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export function entryHash(
  prev: string,
  kind: string,
  id: string,
  data: unknown,
) {
  return createHash('sha256')
    .update(`${prev}\n${kind}\n${id}\n${canonical(data)}`)
    .digest('hex');
}

const text = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v == null ? null : String(v);

export async function buildCapsule(db: DB, now = new Date()): Promise<Capsule> {
  const docs = await db.query(
    `SELECT id::text AS id,${fields.join(',')},file_path,created_at FROM documents ORDER BY id`,
  );
  const revs = await db.query(
    'SELECT id::text AS id,document_id::text AS document_id,snapshot,created_at FROM document_revisions ORDER BY id',
  );
  const entries: CapsuleEntry[] = [];
  let prev = GENESIS;
  const push = (
    kind: CapsuleEntry['kind'],
    id: string,
    data: Record<string, unknown>,
  ) => {
    const hash = entryHash(prev, kind, id, data);
    entries.push({ kind, id, data, prev, hash });
    prev = hash;
  };
  for (const row of docs.rows) {
    const data: Record<string, unknown> = {};
    for (const k of [...fields, 'file_path', 'created_at'])
      data[k] = text(row[k]);
    push('document', row.id, data);
  }
  for (const row of revs.rows) {
    const snapshot =
      typeof row.snapshot === 'string'
        ? JSON.parse(row.snapshot)
        : row.snapshot;
    const kept: Record<string, unknown> = {};
    for (const k of fields) kept[k] = text(snapshot?.[k]);
    push('revision', row.id, {
      document_id: row.document_id,
      created_at: text(row.created_at),
      snapshot: kept,
    });
  }
  return {
    format: CAPSULE_FORMAT,
    created_at: now.toISOString(),
    counts: { documents: docs.rows.length, revisions: revs.rows.length },
    entries,
    root: prev,
  };
}

/** Checks the format, every link of the hash chain, the counts and the root. */
export function verifyCapsule(
  capsule: unknown,
): { ok: true; root: string } | { ok: false; error: string } {
  const c = capsule as Partial<Capsule> | null;
  if (!c || c.format !== CAPSULE_FORMAT || !Array.isArray(c.entries))
    return { ok: false, error: 'Not a Yogilib capsule' };
  let prev = GENESIS;
  const counts = { documents: 0, revisions: 0 };
  for (const [i, e] of c.entries.entries()) {
    if (!e || (e.kind !== 'document' && e.kind !== 'revision'))
      return { ok: false, error: `Entry ${i} has an unknown kind` };
    if (e.prev !== prev)
      return { ok: false, error: `Entry ${i} is out of order` };
    if (entryHash(prev, e.kind, String(e.id), e.data) !== e.hash)
      return { ok: false, error: `Entry ${i} was altered` };
    counts[e.kind === 'document' ? 'documents' : 'revisions']++;
    prev = e.hash;
  }
  if (
    c.counts?.documents !== counts.documents ||
    c.counts?.revisions !== counts.revisions
  )
    return { ok: false, error: 'Entry counts do not match' };
  if (c.root !== prev) return { ok: false, error: 'Root hash does not match' };
  return { ok: true, root: prev };
}
