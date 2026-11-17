import { createHmac, randomUUID } from 'node:crypto';
import type { DB } from './db';
import type { User } from '../types';
import { Failure } from './archive';
import { audit } from './audit';

/**
 * Payment providers. Each is disabled until its secret is configured, and sandbox endpoints are
 * used unless <PROVIDER>_ENV=live. Payment status is only ever decided by a server-to-server
 * lookup with the provider; browser redirects and query strings are never trusted.
 */
export type PaymentStatus = 'pending' | 'completed' | 'failed';
export type PaymentRow = {
  id: string;
  client_ref: string;
  provider: string;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  provider_ref: string | null;
};
type Start =
  | { redirect: string; provider_ref?: string }
  | { form: { action: string; fields: Record<string, string> }; provider_ref?: string };
type Verify = { status: PaymentStatus; provider_ref?: string; reason?: string };
interface Provider {
  id: string;
  label: string;
  region: 'nepal' | 'international';
  currencies: string[];
  enabled(): boolean;
  start(p: PaymentRow, urls: { success: string; cancel: string; site: string }): Promise<Start>;
  verify(p: PaymentRow): Promise<Verify>;
}

let fetcher: typeof fetch = (...a) => fetch(...a);
export function setPaymentFetch(f: typeof fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a));
}
const live = (name: string) => process.env[`${name}_ENV`] === 'live';
const rupees = (minor: number) => String(minor / 100);

async function body(r: Response) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

export function esewaSignature(message: string, secret: string) {
  return createHmac('sha256', secret).update(message).digest('base64');
}

const stripe: Provider = {
  id: 'stripe',
  label: 'Card (Visa, Mastercard, Amex) via Stripe',
  region: 'international',
  currencies: (process.env.STRIPE_CURRENCIES || 'USD').toUpperCase().split(','),
  enabled: () => Boolean(process.env.STRIPE_SECRET_KEY),
  async start(p, urls) {
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: urls.success,
      cancel_url: urls.cancel,
      client_reference_id: p.client_ref,
      'metadata[client_ref]': p.client_ref,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': p.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(p.amount_minor),
      'line_items[0][price_data][product_data][name]': 'Support Yogilib archive',
    });
    const r = await fetcher('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': p.client_ref,
      },
      body: form,
    });
    const data = await body(r);
    if (!r.ok || !data.url) throw new Failure(502, 'Card payment could not be started.');
    return { redirect: data.url, provider_ref: data.id };
  },
  async verify(p) {
    if (!p.provider_ref) return { status: 'failed', reason: 'missing session' };
    const r = await fetcher(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(p.provider_ref)}`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
    );
    const s = await body(r);
    if (!r.ok) return { status: 'pending', reason: 'lookup failed' };
    if (s.payment_status === 'paid') {
      if (Number(s.amount_total) !== Number(p.amount_minor) || String(s.currency).toUpperCase() !== p.currency)
        return { status: 'failed', reason: 'amount mismatch' };
      return { status: 'completed' };
    }
    return { status: s.status === 'expired' ? 'failed' : 'pending' };
  },
};

const khaltiBase = () => (live('KHALTI') ? 'https://khalti.com/api/v2/' : 'https://dev.khalti.com/api/v2/');
const khalti: Provider = {
  id: 'khalti',
  label: 'Khalti (wallet, mobile banking, ConnectIPS, SCT cards)',
  region: 'nepal',
  currencies: ['NPR'],
  enabled: () => Boolean(process.env.KHALTI_SECRET_KEY),
  async start(p, urls) {
    const r = await fetcher(khaltiBase() + 'epayment/initiate/', {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        return_url: urls.success,
        website_url: urls.site,
        amount: p.amount_minor,
        purchase_order_id: p.client_ref,
        purchase_order_name: 'Support Yogilib archive',
      }),
    });
    const data = await body(r);
    if (!r.ok || !data.payment_url) throw new Failure(502, 'Khalti payment could not be started.');
    return { redirect: data.payment_url, provider_ref: data.pidx };
  },
  async verify(p) {
    if (!p.provider_ref) return { status: 'failed', reason: 'missing pidx' };
    const r = await fetcher(khaltiBase() + 'epayment/lookup/', {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pidx: p.provider_ref }),
    });
    const s = await body(r);
    if (!r.ok && !s.status) return { status: 'pending', reason: 'lookup failed' };
    if (s.status === 'Completed')
      return Number(s.total_amount) === Number(p.amount_minor)
        ? { status: 'completed' }
        : { status: 'failed', reason: 'amount mismatch' };
    if (['Expired', 'User canceled', 'Refunded', 'Partially Refunded'].includes(s.status))
      return { status: 'failed', reason: s.status };
    return { status: 'pending' };
  },
};

const esewaProduct = () => process.env.ESEWA_PRODUCT_CODE || 'EPAYTEST';
const esewa: Provider = {
  id: 'esewa',
  label: 'eSewa',
  region: 'nepal',
  currencies: ['NPR'],
  enabled: () => Boolean(process.env.ESEWA_SECRET_KEY),
  async start(p, urls) {
    const total = rupees(p.amount_minor);
    const product = esewaProduct();
    const signed = 'total_amount,transaction_uuid,product_code';
    return {
      form: {
        action: live('ESEWA')
          ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
          : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
        fields: {
          amount: total,
          tax_amount: '0',
          total_amount: total,
          transaction_uuid: p.client_ref,
          product_code: product,
          product_service_charge: '0',
          product_delivery_charge: '0',
          success_url: urls.success,
          failure_url: urls.cancel,
          signed_field_names: signed,
          signature: esewaSignature(
            `total_amount=${total},transaction_uuid=${p.client_ref},product_code=${product}`,
            process.env.ESEWA_SECRET_KEY!,
          ),
        },
      },
    };
  },
  async verify(p) {
    const q = new URLSearchParams({
      product_code: esewaProduct(),
      total_amount: rupees(p.amount_minor),
      transaction_uuid: p.client_ref,
    });
    const base = live('ESEWA')
      ? 'https://epay.esewa.com.np/api/epay/transaction/status/'
      : 'https://rc.esewa.com.np/api/epay/transaction/status/';
    const r = await fetcher(`${base}?${q}`);
    const s = await body(r);
    if (!r.ok) return { status: 'pending', reason: 'lookup failed' };
    if (s.status === 'COMPLETE') return { status: 'completed', provider_ref: s.ref_id || undefined };
    if (['CANCELED', 'NOT_FOUND', 'FULL_REFUND', 'PARTIAL_REFUND'].includes(s.status))
      return { status: 'failed', reason: s.status };
    return { status: 'pending' };
  },
};

const providers: Provider[] = [esewa, khalti, stripe];
const limits: Record<string, [number, number]> = { NPR: [10_00, 10_000_000_00], USD: [1_00, 10_000_00] };

export function listProviders() {
  return providers
    .filter((p) => p.enabled())
    .map(({ id, label, region, currencies }) => ({ id, label, region, currencies }));
}

export async function startPayment(
  db: DB,
  user: User | null,
  input: { provider?: unknown; amount?: unknown; currency?: unknown },
  origin: string,
) {
  const provider = providers.find((p) => p.id === input.provider && p.enabled());
  if (!provider) throw new Failure(400, 'This payment method is not available.');
  const currency = String(input.currency || provider.currencies[0]).toUpperCase();
  if (!provider.currencies.includes(currency) || !limits[currency])
    throw new Failure(400, 'This currency is not available for the selected payment method.');
  const amount = Number(input.amount);
  const minor = Math.round(amount * 100);
  const [min, max] = limits[currency];
  if (!Number.isFinite(amount) || Math.abs(amount * 100 - minor) > 1e-6 || minor < min || minor > max)
    throw new Failure(400, `Enter an amount between ${min / 100} and ${max / 100} ${currency}.`);
  const ref = randomUUID();
  const { rows } = await db.query<PaymentRow>(
    `INSERT INTO payments(client_ref,user_id,provider,amount_minor,currency) VALUES($1,$2,$3,$4,$5)
     RETURNING id::text,client_ref,provider,amount_minor::int,currency,status,provider_ref`,
    [ref, user?.id ?? null, provider.id, minor, currency],
  );
  const payment = rows[0];
  const started = await provider.start(payment, {
    success: `${origin}/support/return/${ref}`,
    cancel: `${origin}/support/return/${ref}?cancelled=1`,
    site: origin,
  });
  if (started.provider_ref)
    await db.query('UPDATE payments SET provider_ref=$2,updated_at=now() WHERE id=$1', [payment.id, started.provider_ref]);
  await audit(db, user, 'payment.create', 'payment', payment.id, { provider: provider.id, amount_minor: minor, currency });
  const { provider_ref: _hidden, ...next } = started;
  return { ref, ...next };
}

export async function verifyPayment(db: DB, ref: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ref)) throw new Failure(404, 'Payment not found');
  const { rows } = await db.query<PaymentRow>(
    'SELECT id::text,client_ref,provider,amount_minor::int,currency,status,provider_ref FROM payments WHERE client_ref=$1',
    [ref],
  );
  const payment = rows[0];
  if (!payment) throw new Failure(404, 'Payment not found');
  const summary = (status: PaymentStatus) => ({
    ref,
    status,
    provider: payment.provider,
    amount: payment.amount_minor / 100,
    currency: payment.currency,
  });
  if (payment.status !== 'pending') return summary(payment.status);
  const provider = providers.find((p) => p.id === payment.provider);
  if (!provider?.enabled()) return summary('pending');
  const result = await provider.verify(payment);
  if (result.status === 'pending') return summary('pending');
  const updated = await db.query(
    `UPDATE payments SET status=$2,provider_ref=COALESCE($3,provider_ref),detail=detail||$4::jsonb,updated_at=now()
     WHERE id=$1 AND status='pending' RETURNING status`,
    [payment.id, result.status, result.provider_ref ?? null, JSON.stringify(result.reason ? { reason: result.reason } : {})],
  );
  if (updated.rows.length)
    await audit(db, null, 'payment.status', 'payment', payment.id, { status: result.status, reason: result.reason });
  return summary(updated.rows[0]?.status ?? result.status);
}

export async function listPayments(db: DB, offset = 0) {
  const { rows } = await db.query(
    `SELECT p.id::text,p.client_ref,p.provider,p.amount_minor::int,p.currency,p.status,p.created_at,u.email
     FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 50 OFFSET $1`,
    [offset],
  );
  return rows;
}
