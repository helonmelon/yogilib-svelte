import type { DB } from './db';
import { snapshot } from './archive';
import { ledgerAvailable, verifyLedger, type LedgerEvent } from './ledger';

export const BACKUP_FORMAT = 'yogilib-archive-backup/1';

/**
 * A self-describing, portable copy of the shared archive: every document,
 * its revision history and the ledger, plus the ledger head hash so a
 * restored copy can prove it matches.
 *
 * Deliberately left out: password hashes, sessions, private notes and
 * reading positions, which belong to readers rather than to the archive. Original
 * files are referenced by `file_path` and must be copied from storage separately.
 */
export async function exportArchive(db: DB) {
  const documents = await db.query('SELECT * FROM documents ORDER BY id');
  const revisions = await db.query(
    'SELECT id,document_id,snapshot,created_at FROM document_revisions ORDER BY id',
  );
  const events = (await ledgerAvailable(db))
    ? (
        await db.query<Record<string, any>>(
          'SELECT seq,kind,document_id,actor_id,payload,prev_hash,hash,created_at FROM archive_events ORDER BY seq',
        )
      ).rows
    : [];
  const migrations = await db.query<{ name: string }>(
    'SELECT name FROM yogilib_migrations ORDER BY name',
  );
  return {
    format: BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    migrations: migrations.rows.map((r) => r.name),
    ledger: await verifyLedger(db),
    documents: documents.rows.map((r) => ({
      id: String(r.id),
      uploaded_by: r.uploaded_by == null ? null : String(r.uploaded_by),
      ...snapshot(r),
    })),
    revisions: revisions.rows.map((r) => ({
      id: String(r.id),
      document_id: String(r.document_id),
      snapshot: snapshot(
        typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot,
      ),
      created_at: new Date(r.created_at).toISOString(),
    })),
    events: events.map((r): LedgerEvent => ({
      kind: r.kind,
      payload:
        typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      prev_hash: r.prev_hash,
      hash: r.hash,
      seq: String(r.seq),
      document_id: r.document_id == null ? null : String(r.document_id),
      actor_id: r.actor_id == null ? null : String(r.actor_id),
      created_at: new Date(r.created_at).toISOString(),
    })),
  };
}
