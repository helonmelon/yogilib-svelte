import type { DB } from './db';
import type { User } from '../types';

export type AuditAction =
  | 'document.create'
  | 'document.update'
  | 'document.delete'
  | 'document.delete_all'
  | 'document.restore'
  | 'user.register'
  | 'user.onboard'
  | 'payment.create'
  | 'payment.status'
  | 'archive.export';

/** Append-only record of who changed what. Failures never block the operation itself. */
export async function audit(
  db: DB,
  actor: User | null,
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  try {
    await db.query(
      'INSERT INTO audit_log(actor_id,action,target_type,target_id,detail) VALUES($1,$2,$3,$4,$5)',
      [actor?.id ?? null, action, targetType, targetId, JSON.stringify(detail)],
    );
  } catch (e) {
    console.error('Audit write failed:', e instanceof Error ? e.name : 'unknown');
  }
}

export async function listAudit(db: DB, offset = 0, limit = 50) {
  const { rows } = await db.query(
    `SELECT a.id::text,a.action,a.target_type,a.target_id,a.detail,a.created_at,u.email AS actor_email
     FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
     ORDER BY a.id DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

/** Portable JSON backup of archive content. Never includes password hashes or sessions. */
export async function exportArchive(db: DB) {
  const documents = await db.query(
    'SELECT id::text,title,title_np,category,description,body_html,lang,script,orig_author,orig_author_np,orig_year,orig_month,orig_day,file_path,uploaded_by::text,created_at FROM documents ORDER BY id',
  );
  const revisions = await db.query(
    'SELECT id::text,document_id::text,snapshot,created_at FROM document_revisions ORDER BY id',
  );
  return {
    format: 'yogilib-archive-export',
    version: 1,
    exported_at: new Date().toISOString(),
    counts: { documents: documents.rows.length, revisions: revisions.rows.length },
    documents: documents.rows,
    revisions: revisions.rows,
  };
}

export async function archiveStats(db: DB) {
  const { rows } = await db.query(
    "SELECT COALESCE(NULLIF(category,''),'अन्य') AS category,count(*)::int AS count FROM documents GROUP BY 1 ORDER BY 2 DESC",
  );
  const total = rows.reduce((n, r) => n + Number(r.count), 0);
  return { total, categories: rows };
}
