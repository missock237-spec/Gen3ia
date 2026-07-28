import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 150 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
  },
};

const webhookErrorRate = new Rate('webhook_errors');
const hmacDuration = new Trend('hmac_validation_duration');

function genHMAC(payload, secret) {
  const h = crypto.createHMAC('sha256', secret);
  h.update(payload);
  return h.digest('hex');
}

export default function () {
  group('Webhooks - HMAC + Plans', () => {
    const events = ['payment.completed', 'payment.failed', 'subscription.created'];
    const evt = events[Math.floor(Math.random() * events.length)];
    const body = JSON.stringify({
      event: evt,
      transaction_id: `txn_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      reference: `sub_pro_user_${Date.now()}`,
      status: evt === 'payment.completed' ? 'completed' : 'failed',
      amount: Math.floor(Math.random()*50000)+1000,
      currency: 'XAF',
      operator: ['mtn','orange','wave'][Math.floor(Math.random()*3)],
      phone: `+2376${Math.floor(Math.random()*100000000)}`,
    });
    const sig = genHMAC(body, 'whsec_k6_test_secret_32chars!!');
    const start = Date.now();
    const r = http.post(`${BASE_URL}/api/payments/webhook`, body, {
      headers: { 'Content-Type': 'application/json', 'x-sebpay-signature': sig },
      timeout: '10s',
    });
    hmacDuration.add(Date.now()-start);
    check(r, { 'webhook 200/401': (x) => x.status === 200 || x.status === 401 });
    if (r.status !== 200) webhookErrorRate.add(1);
    if (__ITER % 5 === 0) {
      const p = http.get(`${BASE_URL}/api/payments/plans`);
      check(p, { 'plans 200': (x) => x.status === 200 });
    }
  });
  sleep(0.5);
}
