import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DB } from './db';
import type { User } from '../types';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export async function sessionUser(
  db: DB,
  token?: string,
): Promise<User | null> {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id,u.email,u.role FROM app_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(token)],
  );
  return rows.length ? ({ ...rows[0], id: String(rows[0].id) } as User) : null;
}
export async function login(db: DB, email: string, password: string) {
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [
    email.trim(),
  ]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash)))
    return null;
  return {
    id: String(rows[0].id),
    email: rows[0].email,
    role: rows[0].role,
  } as User;
}
export async function createSession(db: DB, user: User) {
  const token = randomBytes(32).toString('hex');
  await db.query(
    'INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
    [
      digest(token),
      user.id,
      new Date(Date.now() + 30 * 86400000).toISOString(),
    ],
  );
  return token;
}
export async function revokeSession(db: DB, token?: string) {
  if (token)
    await db.query('DELETE FROM app_sessions WHERE token_hash=$1', [
      digest(token),
    ]);
}
