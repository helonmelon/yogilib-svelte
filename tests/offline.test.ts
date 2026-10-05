import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  addNote,
  cacheNotes,
  clearPrivate,
  deleteNote,
  localNotes,
  pendingFor,
  sync,
  saveProgress,
  cachedProgress,
  download,
  getCached,
} from '../src/lib/client/offline';
import type { ArchiveDocument } from '../src/lib/types';
const user = 'offline-test';
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(async () => {
  await clearPrivate(user);
});
afterEach(() => vi.unstubAllGlobals());
describe('Offline queue and account boundaries', () => {
  it('retains notes after a failed sync and uses the same idempotency key on retry', async () => {
    await addNote(user, '1', 'मूल पाठ', 'निजी');
    const before = await pendingFor(user);
    let sent: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/session')) return reply({ user: { id: user } });
        sent = JSON.parse(String(init?.body));
        throw new TypeError('Offline');
      }),
    );
    await expect(sync(user)).rejects.toThrow('Offline');
    expect((await pendingFor(user))[0].body.client_key).toBe(
      before[0].body.client_key,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url.endsWith('/session')
          ? reply({ user: { id: user } })
          : reply({ id: '99', ...JSON.parse(String(init?.body)) }),
      ),
    );
    await sync(user);
    expect(await pendingFor(user)).toHaveLength(0);
    expect((await localNotes(user, '1'))[0].id).toBe('99');
    expect(sent.client_key).toBe(before[0].body.client_key);
    await deleteNote(user, '1', (await localNotes(user, '1'))[0]);
    expect((await pendingFor(user))[0].body.id).toBe('99');
  });
  it('merges fetched notes without duplicating an unsynced note', async () => {
    await addNote(user, '1', 'quote', 'note');
    const note = (await localNotes(user, '1'))[0];
    await cacheNotes(user, '1', [{ ...note, id: '20' }]);
    expect(await localNotes(user, '1')).toHaveLength(1);
  });
  it('never sends an offline queue under a different account', async () => {
    await addNote(user, '1', 'quote', 'note');
    const fetcher = vi.fn(async () => reply({ user: { id: 'different' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(sync(user)).rejects.toThrow('original account');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await pendingFor(user)).toHaveLength(1);
  });
  it('retains a conflicted position for an explicit user choice', async () => {
    await saveProgress(user, '1', { position: 0.7, version: 2 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/session')
          ? reply({ user: { id: user } })
          : reply({ error: 'Conflict' }, 409),
      ),
    );
    expect(await sync(user)).toEqual(['1']);
    expect(await pendingFor(user)).toHaveLength(1);
    expect((await cachedProgress(user, '1')).position).toBe(0.7);
  });
  it('keeps a newer position saved while a sync request is in flight', async () => {
    await saveProgress(user, '1', { position: 0.2, version: 0 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/session')) return reply({ user: { id: user } });
        await saveProgress(user, '1', { position: 0.8, version: 0 });
        return reply({ position: 0.2, version: 1 });
      }),
    );
    await sync(user);
    expect(await cachedProgress(user, '1')).toEqual({
      position: 0.8,
      version: 1,
    });
    expect((await pendingFor(user))[0].body).toEqual({
      position: 0.8,
      version: 1,
    });
  });
  it('does not mark a document downloaded when its original fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const d = {
      id: 'failed-download',
      file_path: '/api/files/missing.pdf',
    } as ArchiveDocument;
    await expect(download(d)).rejects.toThrow('original file');
    expect(await getCached(d.id)).toBeUndefined();
  });
});
