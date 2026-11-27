// Portable archive snapshot: one self-describing JSON file that holds every document,
// its revision history and the journal head it corresponds to. Like an Urbit pier, it
// is meant to be enough to rebuild the archive somewhere else. It deliberately leaves
// out accounts, password hashes, sessions, private notes and reading positions.
// Originals are referenced by path; copy the storage bucket/directory alongside it.
import type { DB } from './db';
import { verifyJournal } from './journal';

export const EXPORT_FORMAT = 'yogilib-archive';
export const EXPORT_VERSION = 1;

async function batched(db: DB, sql: string) {
  const out: Record<string, any>[] = [];
  let after = '0';
  while (true) {
    const { rows } = await db.query(sql, [after]);
    if (!rows.length) return out;
    out.push(...rows);
    after = String(rows[rows.length - 1].id);
  }
}

export async function exportArchive(db: DB) {
  const journal = await verifyJournal(db);
  const documents = await batched(
    db,
    'SELECT * FROM documents WHERE id>$1 ORDER BY id LIMIT 200',
  );
  const revisions = await batched(
    db,
    'SELECT id,document_id,created_at,snapshot FROM document_revisions WHERE id>$1 ORDER BY id LIMIT 200',
  );
  const str = (v: any) =>
    v == null ? v : v instanceof Date ? v.toISOString() : String(v);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    journal: {
      enabled: journal.enabled,
      ok: journal.ok,
      events: journal.count,
      head: journal.head,
    },
    counts: { documents: documents.length, revisions: revisions.length },
    documents: documents.map((d) => ({
      ...d,
      id: str(d.id),
      uploaded_by: str(d.uploaded_by),
    })),
    revisions: revisions.map((r) => ({
      ...r,
      id: str(r.id),
      document_id: str(r.document_id),
      created_at: str(r.created_at),
    })),
  };
}
