import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { database } from '../src/lib/server/db';
import { handleAPI } from '../src/lib/server/api';
import { setAIClient } from '../src/lib/server/ai';
import { esewaSignature, setPaymentFetch } from '../src/lib/server/payments';

const jars: Record<string, Map<string, string>> = {};
async function call(path: string, method = 'GET', body?: any, who = 'public') {
  const jar = (jars[who] ??= new Map());
  const request = new Request('http://localhost/api/' + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const result = await handleAPI({
    request,
    url: new URL(request.url),
    params: { path: path.split('?')[0] },
    cookies: {
      get: (k: string) => jar.get(k),
      set: (k: string, v: string) => jar.set(k, v),
      delete: (k: string) => jar.delete(k),
    },
    getClientAddress: () => who,
  } as any);
  let data: any;
  try {
    data = await result.json();
  } catch {}
  return { status: result.status, data, headers: result.headers };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

beforeAll(async () => {
  const temp = await mkdtemp(join(tmpdir(), 'yogilib-growth-'));
  process.env.YOGILIB_DATABASE = 'pglite';
  process.env.YOGILIB_LOCAL_DB = join(temp, 'db');
  process.env.YOGILIB_UPLOAD_DIR = join(temp, 'uploads');
  await database();
  expect((await call('demo', 'POST', { role: 'admin' }, 'admin')).status).toBe(200);
});
afterEach(() => {
  setAIClient(null);
  setPaymentFetch(null);
  for (const k of ['KHALTI_SECRET_KEY', 'ESEWA_SECRET_KEY', 'STRIPE_SECRET_KEY', 'YOGILIB_AI_DAILY_LIMIT'])
    delete process.env[k];
});

describe('Reader onboarding', () => {
  it('registers readers only as viewers and records onboarding choices', async () => {
    const weak = await call('register', 'POST', { email: 'reader@example.invalid', password: 'short' }, 'r1');
    expect(weak.status).toBe(400);
    const made = await call(
      'register',
      'POST',
      { email: 'Reader@Example.invalid', password: 'a-long-password', display_name: 'Sita', role: 'admin' },
      'r1',
    );
    expect(made.status).toBe(200);
    expect(made.data.user.role).toBe('viewer');
    expect(made.data.user.onboarded).toBe(false);
    expect((await call('register', 'POST', { email: 'reader@example.invalid', password: 'a-long-password' }, 'r2')).status).toBe(400);
    expect(
      (await call('onboarding', 'POST', { preferred_lang: 'ne', interests: ['किताब', 'रेकर्ड'] }, 'r1')).status,
    ).toBe(200);
    const session = (await call('session', 'GET', undefined, 'r1')).data.user;
    expect(session).toMatchObject({ onboarded: true, preferred_lang: 'ne', display_name: 'Sita', interests: ['किताब', 'रेकर्ड'] });
    await call('logout', 'POST', {}, 'r1');
    expect((await call('login', 'POST', { email: 'READER@example.invalid', password: 'a-long-password' }, 'r3')).status).toBe(200);
  });
  it('can close registration', async () => {
    process.env.YOGILIB_REGISTRATION = 'closed';
    expect((await call('register', 'POST', { email: 'x@example.invalid', password: 'a-long-password' }, 'r4')).status).toBe(403);
    delete process.env.YOGILIB_REGISTRATION;
  });
});

describe('Data management', () => {
  it('keeps an admin-only audit trail and export without secrets', async () => {
    const created = await call('documents', 'POST', { title: 'Audit me', category: 'कागजात', body_html: '<p>पाठ</p>' }, 'admin');
    expect(created.status).toBe(201);
    expect((await call('admin/audit', 'GET', undefined, 'r3')).status).toBe(403);
    const log = await call('admin/audit', 'GET', undefined, 'admin');
    expect(log.data.map((x: any) => x.action)).toEqual(expect.arrayContaining(['document.create', 'user.register', 'user.onboard']));
    const exported = await call('admin/export', 'GET', undefined, 'admin');
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    expect(exported.data.counts.documents).toBeGreaterThan(1);
    expect(JSON.stringify(exported.data)).not.toContain('password_hash');
    expect((await call('stats')).data.total).toBeGreaterThan(1);
  });
});

describe('AI reading companion', () => {
  it('is off without a key and requires sign-in', async () => {
    expect((await call('ai/status')).data.enabled).toBe(false);
    expect((await call('documents/1/ai', 'POST', { kind: 'summary' }, 'r3')).status).toBe(503);
  });
  it('grounds answers in the document, meters usage and enforces the daily limit', async () => {
    const seen: any[] = [];
    setAIClient({
      create: (async (params: any) => {
        seen.push(params);
        return {
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 30 },
          content: [{ type: 'text', text: 'यो सन्धिको सारांश हो।' }],
        };
      }) as any,
    });
    process.env.YOGILIB_AI_DAILY_LIMIT = '2';
    expect((await call('documents/1/ai', 'POST', { kind: 'summary' })).status).toBe(401);
    const r = await call('documents/1/ai', 'POST', { kind: 'summary', lang: 'ne' }, 'r3');
    expect(r.status).toBe(200);
    expect(r.data.answer).toContain('सारांश');
    expect(seen[0].model).toBe('claude-opus-5-5');
    expect(seen[0].system[1].text).toContain('<document');
    expect(seen[0].messages[0].content).toContain('Nepali');
    expect((await call('documents/1/ai', 'POST', { kind: 'ask', text: '' }, 'r3')).status).toBe(400);
    expect((await call('documents/1/ai', 'POST', { kind: 'ask', text: 'Who signed it?' }, 'r3')).status).toBe(200);
    expect((await call('documents/1/ai', 'POST', { kind: 'ask', text: 'And when?' }, 'r3')).status).toBe(429);
  });
});

describe('Payments', () => {
  it('lists only configured providers', async () => {
    expect((await call('payments/providers')).data.providers).toEqual([]);
    process.env.KHALTI_SECRET_KEY = 'test';
    expect((await call('payments/providers')).data.providers.map((p: any) => p.id)).toEqual(['khalti']);
    expect((await call('payments', 'POST', { provider: 'stripe', amount: 5, currency: 'USD' }, 'p0')).status).toBe(400);
  });
  it('signs eSewa fields as base64 HMAC-SHA256 in signed_field_names order', () => {
    const expected = createHmac('sha256', 'k').update('total_amount=1,transaction_uuid=u,product_code=P').digest('base64');
    expect(esewaSignature('total_amount=1,transaction_uuid=u,product_code=P', 'k')).toBe(expected);
  });
  it('builds a signed eSewa form and settles only after the server-side status check', async () => {
    process.env.ESEWA_SECRET_KEY = '8gBm/:&EnhH.1/q';
    const start = await call('payments', 'POST', { provider: 'esewa', amount: 100, currency: 'NPR' }, 'p1');
    expect(start.status).toBe(201);
    expect(start.data.form.fields).toMatchObject({ total_amount: '100', product_code: 'EPAYTEST', transaction_uuid: start.data.ref });
    const f = start.data.form.fields;
    const message = f.signed_field_names.split(',').map((k: string) => `${k}=${f[k]}`).join(',');
    expect(f.signature).toBe(esewaSignature(message, '8gBm/:&EnhH.1/q'));
    expect(start.data.form.fields.success_url).toBe(`http://localhost/support/return/${start.data.ref}`);
    let status = 'PENDING';
    setPaymentFetch((async (url: string) => {
      expect(String(url)).toContain(`transaction_uuid=${start.data.ref}`);
      return json({ status, ref_id: 'R1' });
    }) as any);
    expect((await call(`payments/${start.data.ref}/verify`, 'POST', {}, 'p1')).data.status).toBe('pending');
    status = 'COMPLETE';
    expect((await call(`payments/${start.data.ref}/verify`, 'POST', {}, 'p1')).data.status).toBe('completed');
    status = 'CANCELED';
    expect((await call(`payments/${start.data.ref}/verify`, 'POST', {}, 'p1')).data.status).toBe('completed');
  });
  it('rejects a Khalti payment whose paid amount differs', async () => {
    process.env.KHALTI_SECRET_KEY = 'test';
    setPaymentFetch((async (url: string, init: any) => {
      if (String(url).endsWith('initiate/')) {
        expect(JSON.parse(init.body).amount).toBe(50000);
        return json({ pidx: 'PIDX1', payment_url: 'https://test-pay.khalti.com/?pidx=PIDX1' });
      }
      return json({ pidx: 'PIDX1', status: 'Completed', total_amount: 100 });
    }) as any);
    const start = await call('payments', 'POST', { provider: 'khalti', amount: 500 }, 'p2');
    expect(start.data.redirect).toContain('khalti.com');
    expect(start.data.provider_ref).toBeUndefined();
    expect((await call(`payments/${start.data.ref}/verify`, 'POST', {}, 'p2')).data.status).toBe('failed');
    expect((await call('payments', 'POST', { provider: 'khalti', amount: 1 }, 'p2')).status).toBe(400);
    const list = await call('admin/payments', 'GET', undefined, 'admin');
    expect(list.data.length).toBeGreaterThanOrEqual(2);
  });
});
