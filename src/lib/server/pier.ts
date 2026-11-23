// A Yogilib "pier": one self-contained directory holding the public archive —
// documents, revision history, the hash-chained journal and every original
// file, content-addressed by SHA-256 — plus a manifest that lets anyone verify
// it with no database, network or Yogilib server. Copying the directory is a
// complete backup of the shared archive. (Named after Urbit's pier, the one
// directory that holds a whole ship.)
//
// Private data never leaves the database: passwords, sessions, private notes
// and reading positions are deliberately not exported.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { DB } from './db';
import { GENESIS, chainHash, journalEnabled } from './journal';
import { readMedia } from './storage';

export const PIER_FORMAT = 'yogilib-pier';
export const PIER_VERSION = 1;
const ORIGINAL_EXT = /^\.(pdf|png|jpe?g|webp)$/i;

export type Original = { sha256: string; size: number; file: string };
export type Manifest = {
  format: typeof PIER_FORMAT;
  version: number;
  created_at: string;
  counts: {
    documents: number;
    revisions: number;
    journal: number;
    originals: number;
    missing_originals: number;
  };
  journal_head: string;
  files: Record<string, string>;
  originals: Original[];
};

const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');
const plain = (row: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString() : v,
    ]),
  );
const jsonl = (rows: Record<string, any>[]) =>
  rows.map((r) => JSON.stringify(plain(r)) + '\n').join('');

// Reads an original from wherever the server keeps it (local disk, S3, or the
// legacy upload directory). Returns null if it is not available.
export async function readOriginal(path: string): Promise<Buffer | null> {
  try {
    if (path.startsWith('/api/files/')) return await readMedia(path.slice(11));
    if (path.startsWith('/static/docs/'))
      return await readMedia(path.slice(13), true);
  } catch {}
  return null;
}

async function* pages(db: DB, sql: string, key: string) {
  let after = '0';
  while (true) {
    const r = await db.query(sql, [after]);
    if (!r.rows.length) return;
    for (const row of r.rows) yield row;
    after = String(r.rows[r.rows.length - 1][key]);
  }
}

// Export runs inside one read-only snapshot so documents, revisions and the
// journal agree with each other even while the archive is in use.
export async function exportPier(
  db: DB,
  dir: string,
  options: { read?: (path: string) => Promise<Buffer | null> } = {},
): Promise<Manifest> {
  const read = options.read ?? readOriginal;
  const existing = await readdir(dir).catch(() => [] as string[]);
  if (existing.length)
    throw Error(`Refusing to export into a non-empty directory: ${dir}`);
  await mkdir(join(dir, 'originals'), { recursive: true });

  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const originals = new Map<string, Original>();
    let missing = 0;
    const documents: Record<string, any>[] = [];
    for await (const row of pages(
      tx,
      'SELECT id::text AS id,title,title_np,category,description,body_html,body_text,lang,script,orig_author,orig_author_np,orig_year,orig_month,orig_day,file_path,uploaded_by::text AS uploaded_by,created_at FROM documents WHERE id>$1 ORDER BY id LIMIT 200',
      'id',
    )) {
      let original: string | null = null;
      if (row.file_path) {
        const bytes = await read(String(row.file_path));
        if (bytes) {
          original = sha256(bytes);
          if (!originals.has(original)) {
            const ext = extname(String(row.file_path)).toLowerCase();
            const file = `originals/${original}${ORIGINAL_EXT.test(ext) ? ext : ''}`;
            await writeFile(join(dir, file), bytes, { flag: 'wx' });
            originals.set(original, {
              sha256: original,
              size: bytes.length,
              file,
            });
          }
        } else missing++;
      }
      documents.push({ ...row, original_sha256: original });
    }

    const revisions: Record<string, any>[] = [];
    for await (const row of pages(
      tx,
      'SELECT id::text AS id,document_id::text AS document_id,snapshot,created_at FROM document_revisions WHERE id>$1 ORDER BY id LIMIT 200',
      'id',
    ))
      revisions.push(row);

    // Journal rows keep `entry` and `snapshot` as the exact stored text, so
    // the chain can be re-verified byte for byte from the pier alone.
    const journal: Record<string, any>[] = [];
    let head = GENESIS;
    if (await journalEnabled(tx))
      for await (const row of pages(
        tx,
        'SELECT seq::text AS seq,action,document_id::text AS document_id,entry,snapshot,prev_hash,hash FROM archive_journal WHERE seq>$1 ORDER BY seq LIMIT 500',
        'seq',
      )) {
        journal.push(row);
        head = row.hash;
      }

    const files: Record<string, string> = {};
    for (const [name, rows] of [
      ['documents.jsonl', documents],
      ['revisions.jsonl', revisions],
      ['journal.jsonl', journal],
    ] as const) {
      const text = jsonl(rows);
      await writeFile(join(dir, name), text, { flag: 'wx' });
      files[name] = sha256(text);
    }
    const manifest: Manifest = {
      format: PIER_FORMAT,
      version: PIER_VERSION,
      created_at: new Date().toISOString(),
      counts: {
        documents: documents.length,
        revisions: revisions.length,
        journal: journal.length,
        originals: originals.size,
        missing_originals: missing,
      },
      journal_head: head,
      files,
      originals: [...originals.values()].sort((a, b) =>
        a.sha256.localeCompare(b.sha256),
      ),
    };
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' },
    );
    return manifest;
  });
}

const lines = (text: string) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

// Checks a pier using only the files in it: every listed file and original
// matches its hash, the journal chain is unbroken and ends at the recorded
// head, and every document's original is present.
export async function verifyPier(dir: string) {
  const problems: string[] = [];
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return { ok: false, problems: ['manifest.json is missing or unreadable'] };
  }
  if (manifest.format !== PIER_FORMAT)
    return { ok: false, problems: ['Not a Yogilib pier'] };
  if (manifest.version > PIER_VERSION)
    return {
      ok: false,
      problems: [`Pier version ${manifest.version} is newer than this program`],
    };

  const text: Record<string, string> = {};
  for (const name of ['documents.jsonl', 'revisions.jsonl', 'journal.jsonl']) {
    try {
      text[name] = await readFile(join(dir, name), 'utf8');
    } catch {
      problems.push(`${name} is missing`);
      text[name] = '';
      continue;
    }
    if (sha256(text[name]) !== manifest.files?.[name])
      problems.push(`${name} does not match its manifest hash`);
  }

  const known = new Set<string>();
  for (const o of manifest.originals ?? []) {
    if (!/^[a-f0-9]{64}$/.test(o.sha256) || !o.file.startsWith('originals/')) {
      problems.push(`Invalid original entry ${o.file}`);
      continue;
    }
    try {
      if (sha256(await readFile(join(dir, o.file))) !== o.sha256)
        problems.push(`${o.file} is damaged`);
      else known.add(o.sha256);
    } catch {
      problems.push(`${o.file} is missing`);
    }
  }

  let documents: Record<string, any>[] = [];
  try {
    documents = lines(text['documents.jsonl']);
  } catch {
    problems.push('documents.jsonl is not valid JSON lines');
  }
  for (const d of documents)
    if (d.original_sha256 && !known.has(d.original_sha256))
      problems.push(`Original for document ${d.id} is not in the pier`);

  let prev = GENESIS;
  try {
    for (const x of lines(text['journal.jsonl'])) {
      if (
        x.prev_hash !== prev ||
        x.hash !== chainHash(prev, x.entry, x.snapshot)
      ) {
        problems.push(`Journal chain breaks at entry ${x.seq}`);
        break;
      }
      prev = x.hash;
    }
  } catch {
    problems.push('journal.jsonl is not valid JSON lines');
  }
  if (
    !problems.some((p) => p.startsWith('Journal')) &&
    prev !== manifest.journal_head
  )
    problems.push('Journal does not end at the recorded head');

  return { ok: problems.length === 0, problems, manifest };
}
