import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import treaty from '../content/treaty.json';
export interface DB {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
}
export const isDemo = () => process.env.YOGILIB_DATABASE === 'pglite';
/** Applies every additive migration file in name order. Each file is idempotent. */
export async function migrate(db: DB) {
  const dir = resolve('migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(resolve(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      for (const s of sql.split(';')) if (s.trim()) await tx.query(s);
    });
  }
}
export function wrapPglite(pg: PGlite): DB {
  return {
    query: (s, p = []) => pg.query(s, p),
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({
          query: (s, p = []) => tx.query(s, p),
          transaction: () => {
            throw Error('Nested transaction unsupported');
          },
        }),
      ),
  };
}
export async function seedDemo(db: DB) {
  const existing = await db.query('SELECT id FROM documents LIMIT 1');
  if (!existing.rows.length) {
    const d = treaty;
    await db.query(
      `INSERT INTO documents(title,title_np,category,description,body_html,body_text,lang,script,orig_author,orig_author_np,orig_year,orig_month,orig_day,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        d.title,
        d.title_np,
        d.category,
        d.description,
        d.body_html,
        d.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '),
        d.lang,
        d.script,
        d.orig_author,
        d.orig_author_np,
        d.orig_year,
        d.orig_month,
        d.orig_day,
        '2026-10-04',
      ],
    );
  }
  const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  for (const role of ['viewer', 'uploader', 'admin'])
    await db.query(
      'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING',
      [`${role}@demo.yogilib.invalid`, hash, role],
    );
}
let ready: Promise<DB> | undefined;
export function database(): Promise<DB> {
  return (ready ??= (async () => {
    if (isDemo()) {
      const dir = resolve(process.env.YOGILIB_LOCAL_DB || '.local/postgres');
      await mkdir(dir, { recursive: true });
      const db = wrapPglite(new PGlite(dir));
      await migrate(db);
      await seedDemo(db);
      return db;
    }
    if (!process.env.DATABASE_URL)
      throw Error(
        'Configure DATABASE_URL or use npm run dev for isolated sample data.',
      );
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
    const db: DB = {
      query: async <T>(s: string, p?: any[]) => ({
        rows: (await pool.query(s, p)).rows as T[],
      }),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const result = await fn({
            query: async <T>(s: string, p?: any[]) => ({
              rows: (await c.query(s, p)).rows as T[],
            }),
            transaction: () => {
              throw Error('Nested transaction unsupported');
            },
          });
          await c.query('COMMIT');
          return result;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
    };
    // Never create schema or seed data implicitly against Neon or external Postgres.
    return db;
  })());
}
