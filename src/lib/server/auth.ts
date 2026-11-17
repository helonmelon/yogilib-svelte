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
    `SELECT u.id,u.email,u.role,u.display_name,u.preferred_lang,u.interests,u.onboarded_at IS NOT NULL AS onboarded FROM app_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(token)],
  );
  return rows.length ? ({ ...rows[0], id: String(rows[0].id) } as User) : null;
}
export async function login(db: DB, email: string, password: string) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE email=$1 OR email=$2 ORDER BY (email=$1) DESC LIMIT 1',
    [email.trim(), email.trim().toLowerCase()],
  );
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

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
/** Self-registration always creates a reader (viewer). Roles are only raised by an admin. */
export async function register(
  db: DB,
  email: string,
  password: string,
  displayName: string,
): Promise<User | { error: string }> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address) || address.length > 254) return { error: 'Enter a valid email address.' };
  if (password.length < 10 || password.length > 200)
    return { error: 'Use a password of at least 10 characters.' };
  const name = displayName.trim().slice(0, 80) || null;
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users(email,password_hash,role,display_name) VALUES($1,$2,'viewer',$3)
     ON CONFLICT(email) DO NOTHING RETURNING id,email,role,display_name`,
    [address, hash, name],
  );
  if (!rows.length) return { error: 'An account with this email already exists. Sign in instead.' };
  const row = rows[0] as Omit<User, "id"> & { id: unknown };
  return { ...row, id: String(row.id), interests: [], onboarded: false };
}
export async function completeOnboarding(
  db: DB,
  user: User,
  input: { display_name?: unknown; preferred_lang?: unknown; interests?: unknown },
) {
  const interests = Array.isArray(input.interests)
    ? input.interests.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 12)
    : [];
  const lang = input.preferred_lang === 'ne' ? 'ne' : 'en';
  const name = typeof input.display_name === 'string' ? input.display_name.trim().slice(0, 80) : '';
  await db.query(
    `UPDATE users SET display_name=COALESCE(NULLIF($2,''),display_name),preferred_lang=$3,interests=$4::jsonb,onboarded_at=COALESCE(onboarded_at,now()) WHERE id=$1`,
    [user.id, name, lang, JSON.stringify(interests)],
  );
}
