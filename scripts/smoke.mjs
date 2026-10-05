import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'yogilib-smoke-'));
const port = 5181;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['build/index.js'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    ORIGIN: base,
    YOGILIB_DATABASE: 'pglite',
    YOGILIB_LOCAL_DB: join(dir, 'db'),
    YOGILIB_UPLOAD_DIR: join(dir, 'uploads'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (b) => (output += b));
child.stderr.on('data', (b) => (output += b));
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + '/api/session');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  assert(ready, 'Server did not become ready: ' + output);
  for (const path of [
    '/login',
    '/about',
    '/works',
    '/mission',
    '/similar',
    '/store',
    '/excerpts',
    '/excerpts/sugowlee',
    '/document/1',
    '/offline/index.html',
    '/service-worker.js',
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    if (path === '/document/1') {
      const html = await r.text();
      assert(html.includes('सुगौली सन्धि'));
      assert(html.includes('perpetual peace'));
      assert(!html.includes('undefined'));
    }
    console.log('HTTP 200', path);
  }
  const redirect = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('location'), '/login');
  const login = await fetch(base + '/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  for (const path of [
    '/',
    '/?q=perpetual',
    '/dashboard',
    '/upload',
    '/document/1/edit',
  ]) {
    const r = await fetch(base + path, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200, path);
    if (path === '/?q=perpetual')
      assert((await r.text()).includes('सुगौली सन्धि'));
    console.log('Authenticated HTTP 200', path);
  }
  const cors = await fetch(base + '/api/logout', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://untrusted.invalid',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(cors.status, 403);
  console.log('Production Node server and SSR smoke checks passed.');
} finally {
  child.kill('SIGTERM');
}
