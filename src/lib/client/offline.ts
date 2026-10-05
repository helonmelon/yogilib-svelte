import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { api, send, assetURL, APIError } from './api';
import type { ArchiveDocument, Note, Progress } from '../types';
let adapter: Promise<{
  get: (k: string) => Promise<any>;
  set: (k: string, v: any) => Promise<void>;
  del: (k: string) => Promise<void>;
  keys: () => Promise<string[]>;
}>;
function storage() {
  return (adapter ??= (async () => {
    if (Capacitor.isNativePlatform()) {
      const { CapacitorSQLite, SQLiteConnection } =
        await import('@capacitor-community/sqlite');
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const db = await sqlite.createConnection(
        'yogilib',
        false,
        'no-encryption',
        1,
        false,
      );
      await db.open();
      await db.execute(
        'CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT NOT NULL)',
      );
      return {
        get: async (k: string) => {
          const r = await db.query('SELECT value FROM cache WHERE key=?', [k]);
          return r.values?.length ? JSON.parse(r.values[0].value) : undefined;
        },
        set: async (k: string, v: any) => {
          await db.run('INSERT OR REPLACE INTO cache(key,value) VALUES(?,?)', [
            k,
            JSON.stringify(v),
          ]);
        },
        del: async (k: string) => {
          await db.run('DELETE FROM cache WHERE key=?', [k]);
        },
        keys: async () => {
          const r = await db.query('SELECT key FROM cache');
          return (r.values || []).map((x: any) => x.key);
        },
      };
    }
    const db = await openDB('yogilib-offline', 1, {
      upgrade(db) {
        db.createObjectStore('cache');
      },
    });
    return {
      get: (k: string) => db.get('cache', k),
      set: async (k: string, v: any) => {
        await db.put('cache', v, k);
      },
      del: async (k: string) => {
        await db.delete('cache', k);
      },
      keys: async () => db.getAllKeys('cache') as Promise<string[]>,
    };
  })());
}
export const getCached = async (
  id: string,
): Promise<ArchiveDocument | undefined> =>
  (await storage()).get('document:' + id);
export async function downloads(): Promise<ArchiveDocument[]> {
  const s = await storage();
  return Promise.all(
    (await s.keys())
      .filter((k) => k.startsWith('document:'))
      .map((k) => s.get(k)),
  );
}
export async function download(d: ArchiveDocument) {
  const s = await storage();
  let file: any;
  if (d.file_path) {
    const r = await fetch(assetURL(d.file_path));
    if (!r.ok) throw Error('The original file could not be downloaded');
    const blob = await r.blob();
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const path = `originals/${d.id}-${d.version}${d.file_path.match(/\.[a-z]+$/i)?.[0] || '.pdf'}`;
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Data,
        recursive: true,
      });
      file = { native: path, type: blob.type };
    } else file = { blob, type: blob.type };
  }
  // Mark a work downloaded only after its requested original has finished.
  if (file) await s.set('file:' + d.id, file);
  await s.set('document:' + d.id, d);
}
export async function originalURL(id: string) {
  const f = await (await storage()).get('file:' + id);
  if (!f) return '';
  if (f.native) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const uri = await Filesystem.getUri({
      path: f.native,
      directory: Directory.Data,
    });
    return Capacitor.convertFileSrc(uri.uri);
  }
  return URL.createObjectURL(f.blob);
}
export async function removeDownload(id: string) {
  const s = await storage();
  const f = await s.get('file:' + id);
  if (f?.native) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: f.native, directory: Directory.Data });
  }
  await s.del('file:' + id);
  await s.del('document:' + id);
}
export const localNotes = async (user: string, id: string): Promise<Note[]> =>
  (await (await storage()).get(`notes:${user}:${id}`)) || [];
export const cacheNotes = async (user: string, id: string, notes: Note[]) =>
  (async () => {
    const s = await storage();
    const pending = await pendingFor(user);
    const adds = pending
      .filter((x) => x.doc === id && x.kind === 'add')
      .map((x) => ({ id: x.id, ...x.body }));
    const deleted = new Set(
      pending
        .filter((x) => x.doc === id && x.kind === 'delete')
        .map((x) => x.body.id),
    );
    await s.set(`notes:${user}:${id}`, [
      ...notes.filter((n) => !deleted.has(n.id)),
      ...adds.filter((a) => !notes.some((n) => n.client_key === a.client_key)),
    ]);
  })();
type Operation = {
  id: string;
  user: string;
  doc: string;
  kind: 'add' | 'delete' | 'progress';
  body: any;
};
export async function pendingFor(user: string): Promise<Operation[]> {
  const s = await storage();
  return (
    await Promise.all(
      (await s.keys())
        .filter((k) => k.startsWith(`outbox:${user}:`))
        .map((k) => s.get(k)),
    )
  ).sort((a, b) => a.id.localeCompare(b.id));
}
export async function addNote(
  user: string,
  doc: string,
  quote: string,
  note: string,
) {
  const s = await storage();
  const client_key = crypto.randomUUID();
  const op: Operation = {
    id: client_key,
    user,
    doc,
    kind: 'add',
    body: { quote, note, client_key },
  };
  await s.set(`outbox:${user}:${op.id}`, op);
  await cacheNotes(user, doc, await localNotes(user, doc));
}
export async function deleteNote(user: string, doc: string, n: Note) {
  const s = await storage();
  if (n.client_key) await s.del(`outbox:${user}:${n.client_key}`);
  if (/^\d+$/.test(n.id)) {
    const id = crypto.randomUUID();
    await s.set(`outbox:${user}:${id}`, {
      id,
      user,
      doc,
      kind: 'delete',
      body: { id: n.id },
    });
  }
  await s.set(
    `notes:${user}:${doc}`,
    (await localNotes(user, doc)).filter((x) => x.id !== n.id),
  );
}
export const cachedProgress = async (
  user: string,
  doc: string,
): Promise<Progress> =>
  (await (await storage()).get(`progress:${user}:${doc}`)) || {
    position: 0,
    version: 0,
  };
export async function saveProgress(user: string, doc: string, p: Progress) {
  const s = await storage();
  await s.set(`progress:${user}:${doc}`, p);
  const id = 'progress-' + doc;
  await s.set(`outbox:${user}:${id}`, {
    id,
    user,
    doc,
    kind: 'progress',
    body: p,
  });
}
export async function acceptProgress(user: string, doc: string, p: Progress) {
  const s = await storage();
  await s.del(`outbox:${user}:progress-${doc}`);
  await s.set(`progress:${user}:${doc}`, p);
}
const syncing = new Map<string, Promise<string[]>>();
export function sync(user: string): Promise<string[]> {
  const existing = syncing.get(user);
  if (existing) return existing;
  const task = (async () => {
    const session = await api('session');
    if (session.user?.id !== user)
      throw Error('Sign in with the original account to sync');
    const s = await storage();
    const conflicts: string[] = [];
    for (const op of await pendingFor(user)) {
      try {
        let result: any;
        if (op.kind === 'add')
          result = await send(`documents/${op.doc}/notes`, op.body);
        else if (op.kind === 'delete')
          await api(`documents/${op.doc}/notes/${op.body.id}`, {
            method: 'DELETE',
          });
        else
          result = await send(`documents/${op.doc}/progress`, op.body, 'PUT');
        const key = `outbox:${user}:${op.id}`;
        const current = await s.get(key);
        if (op.kind === 'add') {
          // A locally deleted note may have reached the server while its request was in flight.
          if (!current)
            await api(`documents/${op.doc}/notes/${result.id}`, {
              method: 'DELETE',
            });
          else {
            const notes = await localNotes(user, op.doc);
            await s.set(
              `notes:${user}:${op.doc}`,
              notes.map((n) =>
                n.client_key === op.body.client_key ? result : n,
              ),
            );
          }
        }
        if (JSON.stringify(current) === JSON.stringify(op)) {
          if (op.kind === 'progress')
            await s.set(`progress:${user}:${op.doc}`, result);
          await s.del(key);
        } else if (op.kind === 'progress' && current) {
          // Preserve a newer local position while advancing its server version.
          current.body = { ...current.body, version: result.version };
          await s.set(key, current);
          await s.set(`progress:${user}:${op.doc}`, current.body);
        }
      } catch (e) {
        if (e instanceof APIError && e.status === 409) {
          conflicts.push(op.doc);
          continue;
        }
        throw e;
      }
    }
    return conflicts;
  })().finally(() => syncing.delete(user));
  syncing.set(user, task);
  return task;
}
export async function clearPrivate(user: string) {
  const s = await storage();
  for (const k of await s.keys())
    if (
      k.startsWith(`notes:${user}:`) ||
      k.startsWith(`progress:${user}:`) ||
      k.startsWith(`outbox:${user}:`)
    )
      await s.del(k);
}
