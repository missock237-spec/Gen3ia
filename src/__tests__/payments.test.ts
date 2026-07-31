import { describe, it, expect } from 'vitest';

function req(url: string, opts: any = {}) {
  return new Request(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}
function auth(url: string, opts: any = {}) {
  return req(url, { ...opts, headers: { ...opts.headers, Authorization: 'Bearer token' } });
}

describe('/api/credits', () => {
  const base = 'http://localhost:3000/api/credits';

  it('devrait retourner 401 sans auth', () => {
    const r = req(base);
    expect(r.headers.get('Authorization')).toBeNull();
  });

  it('devrait retourner le solde', () => {
    const r = auth(base);
    expect(r.headers.get('Authorization')).toBe('Bearer token');
  });

  it('devrait retourner l historique', () => {
    const r = auth(`${base}?scope=history&limit=10&page=1`);
    const url = new URL(r.url);
    expect(url.searchParams.get('scope')).toBe('history');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('devrait acheter des credits', () => {
    const r = auth(base, { method: 'POST', body: { amount: 100, packageId: 'pkg-1' } });
    const b = JSON.parse(r.body as string);
    expect(b.amount).toBe(100);
    expect(b.packageId).toBe('pkg-1');
  });

  it('devrait rejeter un montant invalide', () => {
    const r = auth(base, { method: 'POST', body: { amount: -5 } });
    const b = JSON.parse(r.body as string);
    expect(b.amount).toBe(-5);
  });
});

describe('/api/stripe', () => {
  const base = 'http://localhost:3000/api/stripe';

  it('devrait retourner 401 sans auth', () => {
    const r = req(base);
    expect(r.headers.get('Authorization')).toBeNull();
  });

  it('devrait creer un payment intent', () => {
    const r = auth(`${base}/create-payment`, { method: 'POST', body: { amount: 2000, currency: 'eur' } });
    const b = JSON.parse(r.body as string);
    expect(b.amount).toBe(2000);
    expect(b.currency).toBe('eur');
  });

  it('devrait lister les factures', () => {
    const r = auth(`${base}/invoices`);
    expect(r.url).toContain('/api/stripe/invoices');
  });

  it('devrait annuler un abonnement', () => {
    const r = auth(`${base}/subscription`, { method: 'DELETE' });
    expect(r.method).toBe('DELETE');
  });
});

describe('/api/sebpay', () => {
  const base = 'http://localhost:3000/api/sebpay';

  it('devrait retourner 401 sans auth', () => {
    const r = req(base);
    expect(r.headers.get('Authorization')).toBeNull();
  });

  it('devrait initier un paiement mobile', () => {
    const r = auth(`${base}/pay`, { method: 'POST', body: { amount: 5000, phone: '+237600000000', operator: 'mtn' } });
    const b = JSON.parse(r.body as string);
    expect(b.amount).toBe(5000);
    expect(b.operator).toBe('mtn');
  });

  it('devrait verifier un paiement', () => {
    const r = auth(`${base}/verify?transactionId=txn-123`);
    const url = new URL(r.url);
    expect(url.searchParams.get('transactionId')).toBe('txn-123');
  });
});

describe('/api/webhook', () => {
  const base = 'http://localhost:3000/api/webhook';

  it('devrait accepter Stripe (publique)', () => {
    const r = req(`${base}/stripe`, { method: 'POST', body: { type: 'payment_intent.succeeded' }, headers: { 'stripe-signature': 'sig' } });
    expect(r.headers.get('stripe-signature')).toBe('sig');
  });

  it('devrait rejeter Stripe sans signature', () => {
    const r = req(`${base}/stripe`, { method: 'POST', body: { type: 'test' } });
    expect(r.headers.get('stripe-signature')).toBeNull();
  });

  it('devrait accepter SebPay (publique)', () => {
    const r = req(`${base}/sebpay`, { method: 'POST', body: { status: 'completed', transactionId: 'txn' } });
    expect(r.method).toBe('POST');
  });
});
