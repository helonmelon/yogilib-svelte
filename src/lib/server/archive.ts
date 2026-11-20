import sanitize from 'sanitize-html';
import { createHash } from 'node:crypto';
import type { DB } from './db';
import { record } from './chronicle';
import type { ArchiveDocument, User } from '../types';
import { categories, canDelete } from '../types';
export class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function safeHTML(html: string) {
  return sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'section',
      'article',
      'span',
      'sub',
      'sup',
    ],
    allowedAttributes: {
      '*': ['id', 'lang', 'class', 'style'],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
    },
    allowedStyles: {
      '*': {
        color: [/^(?:#[a-fA-F0-9]{3,8}|rgb\([\d\s,]+\)|[a-zA-Z]+)$/],
        'background-color': [
          /^(?:#[a-fA-F0-9]{3,8}|rgb\([\d\s,]+\)|[a-zA-Z]+)$/,
        ],
        'text-align': [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    transformTags: {
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}
export function plainHTML(html: string) {
  return sanitize(
    html.replace(/<\/(?:p|div|h[1-6]|li|section|tr|br)>/gi, ' '),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/\s+/g, ' ')
    .trim();
}
export function version(d: Record<string, any>) {
  return createHash('sha256')
    .update(JSON.stringify(fields.map((k) => d[k] ?? '')))
    .digest('hex')
    .slice(0, 24);
}
export const fields = [
  'title',
  'title_np',
  'category',
  'description',
  'body_html',
  'body_text',
  'lang',
  'script',
  'orig_author',
  'orig_author_np',
  'orig_year',
  'orig_month',
  'orig_day',
];
export function documentRow(row: Record<string, any>): ArchiveDocument {
  const d: any = { ...row };
  for (const k of [...fields, 'file_path', 'uploaded_by'])
    d[k] = String(d[k] ?? '');
  d.id = String(row.id);
  d.version = version(row);
  d.body_html = safeHTML(d.body_html);
  return d;
}
export async function getDocument(db: DB, id: string, lock = false) {
  if (!/^\d+$/.test(id)) throw new Failure(404, 'Document not found');
  const { rows } = await db.query(
    'SELECT * FROM documents WHERE id=$1' + (lock ? ' FOR UPDATE' : ''),
    [id],
  );
  if (!rows.length) throw new Failure(404, 'Document not found');
  return rows[0];
}
export async function listDocuments(db: DB, q = '', cat = '', offset = 0) {
  const params: any[] = [];
  const where: string[] = [];
  if (q.trim()) {
    params.push(q.trim(), `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`);
    where.push(
      `(to_tsvector('simple',COALESCE(title,'')||' '||COALESCE(title_np,'')||' '||COALESCE(description,'')||' '||COALESCE(body_text,'')) @@ plainto_tsquery('simple',$1) OR title ILIKE $2 OR title_np ILIKE $2 OR description ILIKE $2 OR body_text ILIKE $2)`,
    );
  }
  if (cat && cat !== 'सबै') {
    params.push(cat);
    where.push(`category=$${params.length}`);
  }
  const predicate = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = await db.query<{ count: string }>(
    'SELECT count(*) FROM documents' + predicate,
    params,
  );
  params.push(offset);
  const { rows } = await db.query(
    'SELECT * FROM documents' +
      predicate +
      ` ORDER BY id DESC LIMIT 40 OFFSET $${params.length}`,
    params,
  );
  return {
    documents: rows
      .map(documentRow)
      .map((d) => ({ ...d, body_html: '', body_text: '' })),
    total: Number(total.rows[0].count),
    offset,
  };
}
export function validateDocument(input: Record<string, any>) {
  const d: Record<string, string> = {};
  for (const k of fields) {
    if (k === 'body_text') continue;
    d[k] = String(input[k] ?? '');
    if (d[k].length > (k === 'body_html' ? 2_000_000 : 10000))
      throw new Failure(400, 'Field is too long');
  }
  d.title = d.title.trim();
  if (!d.title) throw new Failure(400, 'Title is required.');
  if (!categories.includes(d.category) || d.category === 'सबै')
    throw new Failure(400, 'Choose a category');
  d.body_text = plainHTML(d.body_html);
  return d;
}
export async function saveDocument(
  db: DB,
  input: Record<string, any>,
  user: User,
  id?: string,
) {
  if (id ? user.role !== 'admin' : !['admin', 'uploader'].includes(user.role))
    throw new Failure(403, 'Forbidden');
  const d = validateDocument(input);
  return db.transaction(async (tx) => {
    if (id) {
      const current = await getDocument(tx, id, true);
      if (input.version !== version(current))
        throw new Failure(409, 'This document changed. Reload before saving.');
      await tx.query(
        'INSERT INTO document_revisions(document_id,snapshot) VALUES($1,$2)',
        [id, JSON.stringify(current)],
      );
      await tx.query(
        `UPDATE documents SET ${fields.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${fields.length + 1}`,
        [...fields.map((k) => d[k]), id],
      );
      const saved = documentRow(await getDocument(tx, id));
      await record(tx, 'document.revised', user.id, id, {
        from: version(current),
        to: saved.version,
        title: saved.title,
      });
      return saved;
    }
    const keys = [...fields, 'uploaded_by', 'created_at', 'file_path'];
    const values = [
      ...fields.map((k) => d[k]),
      user.id,
      new Date().toISOString(),
      input.file_path || '',
    ];
    const r = await tx.query(
      `INSERT INTO documents(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      values,
    );
    const created = documentRow(r.rows[0]);
    await record(tx, 'document.created', user.id, created.id, {
      to: created.version,
      title: created.title,
      category: created.category,
      file: created.file_path,
    });
    return created;
  });
}
export async function deleteDocument(db: DB, id: string, user: User) {
  return db.transaction(async (tx) => {
    const d = documentRow(await getDocument(tx, id, true));
    if (!canDelete(user, d))
      throw new Failure(403, 'You can only delete documents you uploaded.');
    for (const table of [
      'document_notes',
      'document_revisions',
      'reading_progress',
    ])
      await tx.query(`DELETE FROM ${table} WHERE document_id=$1`, [id]);
    await tx.query('DELETE FROM documents WHERE id=$1', [id]);
    await record(tx, 'document.deleted', user.id, d.id, {
      from: d.version,
      title: d.title,
      file: d.file_path,
    });
    return d;
  });
}
export async function deleteAllDocuments(db: DB, user: User) {
  if (user.role !== 'admin') throw new Failure(403, 'Forbidden');
  return db.transaction(async (tx) => {
    const documents = await tx.query<{ file_path: string }>(
      'SELECT file_path FROM documents',
    );
    for (const table of [
      'document_notes',
      'document_revisions',
      'reading_progress',
    ])
      await tx.query(`DELETE FROM ${table}`);
    await tx.query('DELETE FROM documents');
    await record(tx, 'archive.cleared', user.id, null, {
      count: documents.rows.length,
    });
    return {
      count: documents.rows.length,
      files: documents.rows.map((row) => row.file_path).filter(Boolean),
    };
  });
}
export async function restoreDocument(
  db: DB,
  id: string,
  revision: string,
  expected: string,
  actor: string | null = null,
) {
  return db.transaction(async (tx) => {
    const current = await getDocument(tx, id, true);
    if (version(current) !== expected)
      throw new Failure(409, 'Document changed. Reload before restoring.');
    const r = await tx.query(
      'SELECT snapshot FROM document_revisions WHERE id=$1 AND document_id=$2',
      [revision, id],
    );
    if (!r.rows.length) throw new Failure(404, 'Revision not found');
    await tx.query(
      'INSERT INTO document_revisions(document_id,snapshot) VALUES($1,$2)',
      [id, JSON.stringify(current)],
    );
    const d = r.rows[0].snapshot;
    await tx.query(
      `UPDATE documents SET ${fields.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${fields.length + 1}`,
      [...fields.map((k) => d[k] ?? ''), id],
    );
    const restored = documentRow(await getDocument(tx, id));
    await record(tx, 'document.restored', actor, id, {
      from: version(current),
      to: restored.version,
      revision,
    });
    return restored;
  });
}
