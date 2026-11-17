import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { database, isDemo } from './db';
import {
  sessionUser,
  login,
  createSession,
  revokeSession,
  register,
  completeOnboarding,
} from './auth';
import { audit, listAudit, exportArchive, archiveStats } from './audit';
import { aiEnabled, askAI } from './ai';
import { listProviders, startPayment, verifyPayment, listPayments } from './payments';
import {
  Failure,
  getDocument,
  documentRow,
  listDocuments,
  saveDocument,
  deleteDocument,
  deleteAllDocuments,
  restoreDocument,
} from './archive';
import { saveMedia, removeMedia, mediaResponse } from './storage';
import type { User } from '../types';
async function input(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, 'Invalid request');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_500_000) {
      await reader.cancel();
      throw new Failure(413, 'Request too large');
    }
    parts.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Expected object');
    return value;
  } catch {
    throw new Failure(400, 'Invalid JSON');
  }
}
const limits = new Map<string, { count: number; until: number }>();
export function resetLoginLimits() {
  limits.clear();
}
/** Simple in-memory fixed-window limiter keyed by client address and bucket. */
function throttle(key: string, max: number, windowMs = 600000) {
  const now = Date.now();
  const rate = limits.get(key);
  if (rate && rate.until > now && rate.count >= max)
    throw new Failure(429, 'Too many attempts. Try again later.');
  if (limits.size > 10000)
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  limits.set(key, {
    count: rate && rate.until > now ? rate.count + 1 : 1,
    until: rate && rate.until > now ? rate.until : now + windowMs,
  });
}
export async function handleAPI(event: RequestEvent) {
  const { request, cookies, url } = event;
  const path = (event.params.path || '').split('/');
  const method = request.method;
  try {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (path[0] === 'files' && method === 'GET')
      return mediaResponse(path.slice(1).join('/'), request);
    const db = await database();
    const user = await sessionUser(db, cookies.get('yogilib-session'));
    const requireUser = (role?: string): User => {
      if (!user) throw new Failure(401, 'Sign in to continue');
      if (
        (role === 'admin' && user.role !== 'admin') ||
        (role === 'uploader' && !['admin', 'uploader'].includes(user.role))
      )
        throw new Failure(403, 'Forbidden');
      return user;
    };
    const setSession = async (u: User) => {
      const token = await createSession(db, u);
      cookies.set('yogilib-session', token, {
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite:
          ['capacitor://localhost', 'https://localhost'].includes(
            request.headers.get('origin') || '',
          ) && url.protocol === 'https:'
            ? 'none'
            : 'lax',
        maxAge: 30 * 86400,
      });
      return json({ user: u, demo: isDemo() });
    };
    if (path[0] === 'session' && method === 'GET')
      return json({ user, demo: isDemo() });
    let address = 'unknown';
    try {
      address = event.getClientAddress();
    } catch {}
    const origin = process.env.PUBLIC_APP_ORIGIN || url.origin;
    if (path[0] === 'login' && method === 'POST') {
      throttle(address, 12);
      const b = await input(request);
      const u = await login(
        db,
        String(b.email || ''),
        String(b.password || ''),
      );
      if (!u) throw new Failure(401, 'Invalid email or password.');
      limits.delete(address);
      return setSession(u);
    }
    if (path[0] === 'register' && method === 'POST') {
      if (process.env.YOGILIB_REGISTRATION === 'closed')
        throw new Failure(403, 'New reader accounts are not open right now.');
      throttle('register:' + address, 5, 3600000);
      const b = await input(request);
      const created = await register(
        db,
        String(b.email || ''),
        String(b.password || ''),
        String(b.display_name || ''),
      );
      if ('error' in created) throw new Failure(400, created.error);
      await audit(db, created, 'user.register', 'user', created.id);
      return setSession(created);
    }
    if (path[0] === 'onboarding' && method === 'POST') {
      const u = requireUser();
      await completeOnboarding(db, u, await input(request));
      await audit(db, u, 'user.onboard', 'user', u.id);
      return json({ ok: true });
    }
    if (path[0] === 'stats' && method === 'GET') return json(await archiveStats(db));
    if (path[0] === 'ai' && path[1] === 'status' && method === 'GET')
      return json({ enabled: aiEnabled() });
    if (path[0] === 'payments') {
      if (path[1] === 'providers' && method === 'GET')
        return json({ providers: listProviders() });
      if (!path[1] && method === 'POST') {
        throttle('pay:' + address, 20);
        return json(await startPayment(db, user, await input(request), origin), { status: 201 });
      }
      if (path[1] && path[2] === 'verify' && method === 'POST') {
        throttle('verify:' + address, 60);
        return json(await verifyPayment(db, path[1]));
      }
      throw new Failure(405, 'Method not allowed');
    }
    if (path[0] === 'admin') {
      const admin = requireUser('admin');
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) | 0);
      if (path[1] === 'audit' && method === 'GET') return json(await listAudit(db, offset));
      if (path[1] === 'payments' && method === 'GET') return json(await listPayments(db, offset));
      if (path[1] === 'export' && method === 'GET') {
        const data = await exportArchive(db);
        await audit(db, admin, 'archive.export', 'archive', null, data.counts);
        return new Response(JSON.stringify(data, null, 1), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="yogilib-export-${data.exported_at.slice(0, 10)}.json"`,
          },
        });
      }
      throw new Failure(404, 'Not found');
    }
    if (path[0] === 'demo' && method === 'POST') {
      if (!isDemo()) throw new Failure(404, 'Not found');
      const b = await input(request);
      if (!['viewer', 'uploader', 'admin'].includes(b.role))
        throw new Failure(400, 'Invalid role');
      const r = await db.query(
        'SELECT id,email,role FROM users WHERE email=$1',
        [`${b.role}@demo.yogilib.invalid`],
      );
      return setSession({ ...r.rows[0], id: String(r.rows[0].id) } as User);
    }
    if (path[0] === 'logout' && method === 'POST') {
      await revokeSession(db, cookies.get('yogilib-session'));
      cookies.delete('yogilib-session', { path: '/' });
      return json({ ok: true });
    }
    if (path[0] !== 'documents') throw new Failure(404, 'Not found');
    const id = path[1];
    if (id === 'all' && method === 'DELETE') {
      const admin = requireUser('admin');
      const deleted = await deleteAllDocuments(db, admin);
      await audit(db, admin, 'document.delete_all', 'document', null, { count: deleted.count });
      await Promise.all(deleted.files.map((file) => removeMedia(file).catch(() => {})));
      return json({ ok: true, deleted: deleted.count });
    }
    if (!id && method === 'GET') {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new Failure(400, 'Invalid page');
      return json(
        await listDocuments(
          db,
          (url.searchParams.get('q') || '').slice(0, 200),
          url.searchParams.get('cat') || '',
          offset,
        ),
      );
    }
    if (!id && method === 'POST') {
      const u = requireUser('uploader');
      let filePath = '';
      let b: Record<string, any>;
      if (
        request.headers.get('content-type')?.includes('multipart/form-data')
      ) {
        const f = await request.formData();
        b = Object.fromEntries(f);
        const file = f.get('file');
        if (file instanceof File && file.size) filePath = await saveMedia(file);
      } else b = await input(request);
      try {
        const saved = await saveDocument(db, { ...b, file_path: filePath }, u);
        await audit(db, u, 'document.create', 'document', String(saved.id), { title: saved.title });
        return json(saved, { status: 201 });
      } catch (e) {
        if (filePath) await removeMedia(filePath).catch(() => {});
        throw e;
      }
    }
    if (!id) throw new Failure(405, 'Method not allowed');
    if (path.length === 2) {
      if (method === 'GET') return json(documentRow(await getDocument(db, id)));
      if (method === 'PUT') {
        const admin = requireUser('admin');
        const saved = await saveDocument(db, await input(request), admin, id);
        await audit(db, admin, 'document.update', 'document', id, { title: saved.title });
        return json(saved);
      }
      if (method === 'DELETE') {
        const u = requireUser('uploader');
        const deleted = await deleteDocument(db, id, u);
        await audit(db, u, 'document.delete', 'document', id);
        await removeMedia(deleted.file_path).catch(() => {});
        return json({ ok: true });
      }
    }
    if (path[2] === 'notes') {
      const u = requireUser();
      await getDocument(db, id);
      if (method === 'GET') {
        const r = await db.query(
          'SELECT id::text,quote,note,client_key FROM document_notes WHERE document_id=$1 AND user_id=$2 ORDER BY id',
          [id, u.id],
        );
        return json(r.rows);
      }
      if (method === 'POST') {
        const b = await input(request);
        if (
          typeof b.quote !== 'string' ||
          !b.quote.trim() ||
          b.quote.length > 10000 ||
          typeof b.note !== 'string' ||
          b.note.length > 5000 ||
          typeof b.client_key !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(b.client_key)
        )
          throw new Failure(400, 'Select a shorter passage and note');
        const r = await db.query(
          `INSERT INTO document_notes(document_id,user_id,quote,note,client_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,user_id,client_key) DO UPDATE SET client_key=EXCLUDED.client_key RETURNING id::text,quote,note,client_key`,
          [id, u.id, b.quote, b.note, b.client_key],
        );
        return json(r.rows[0], { status: 201 });
      }
      if (method === 'DELETE' && /^\d+$/.test(path[3] || '')) {
        await db.query(
          'DELETE FROM document_notes WHERE id=$1 AND document_id=$2 AND user_id=$3',
          [path[3], id, u.id],
        );
        return json({ ok: true });
      }
    }
    if (path[2] === 'progress') {
      const u = requireUser();
      await getDocument(db, id);
      if (method === 'GET') {
        const r = await db.query(
          'SELECT position,version FROM reading_progress WHERE user_id=$1 AND document_id=$2',
          [u.id, id],
        );
        return json(r.rows[0] || { position: 0, version: 0 });
      }
      if (method === 'PUT') {
        const b = await input(request);
        if (
          !Number.isFinite(b.position) ||
          b.position < 0 ||
          b.position > 1 ||
          !Number.isInteger(b.version) ||
          b.version < 0
        )
          throw new Failure(400, 'Invalid reading position');
        const r = await db.query(
          `INSERT INTO reading_progress(user_id,document_id,position) SELECT $1,$2,$3 WHERE $4=0 ON CONFLICT(user_id,document_id) DO NOTHING RETURNING position,version`,
          [u.id, id, b.position, b.version],
        );
        if (r.rows.length) return json(r.rows[0]);
        const updated = await db.query(
          'UPDATE reading_progress SET position=$3,version=version+1,updated_at=now() WHERE user_id=$1 AND document_id=$2 AND version=$4 RETURNING position,version',
          [u.id, id, b.position, b.version],
        );
        if (!updated.rows.length)
          throw new Failure(409, 'Reading position changed on another device');
        return json(updated.rows[0]);
      }
    }
    if (path[2] === 'ai' && method === 'POST') {
      const u = requireUser();
      const doc = await getDocument(db, id);
      return json(await askAI(db, u, doc as any, await input(request)));
    }
    if (path[2] === 'revisions') {
      const admin = requireUser('admin');
      await getDocument(db, id);
      if (method === 'GET') {
        const r = await db.query(
          'SELECT id::text,created_at,snapshot FROM document_revisions WHERE document_id=$1 ORDER BY id DESC',
          [id],
        );
        return json(
          r.rows.map((x) => ({ ...x, snapshot: documentRow(x.snapshot) })),
        );
      }
      if (method === 'POST' && /^\d+$/.test(path[3] || '')) {
        const b = await input(request);
        const restored = await restoreDocument(db, id, path[3], String(b.version));
        await audit(db, admin, 'document.restore', 'document', id, { revision: path[3] });
        return json(restored);
      }
    }
    throw new Failure(405, 'Method not allowed');
  } catch (e) {
    if (e instanceof Failure)
      return json({ error: e.message }, { status: e.status });
    console.error(
      'API operation failed:',
      e instanceof Error ? e.name : 'unknown',
    );
    return json(
      { error: 'The server could not complete this request.' },
      { status: 500 },
    );
  }
}
