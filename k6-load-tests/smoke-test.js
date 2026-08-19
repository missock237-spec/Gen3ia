// ============================================================
// k6 Smoke Test — Validation rapide de l'infrastructure
// Execute un mini-test de chaque endpoint critique
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 1,
  iterations: 10,
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function _default() {
  group('1. Plans API', () => {
    const r = http.get(`${BASE_URL}/api/payments/plans`);
    check(r, {
      'plans status 200': (x) => x.status === 200,
      'plans contient 4 plans': (x) => {
        try { return JSON.parse(x.body).data.length === 4; }
        catch { return false; }
      },
    });
  });

  sleep(1);

  group('2. Webhook validation', () => {
    const body = JSON.stringify({
      event: 'payment.completed',
      transaction_id: `smoke_${Date.now()}`,
      reference: 'sub_pro_user_smoke',
      status: 'completed',
      amount: 15000,
      currency: 'XAF',
      operator: 'mtn',
      phone: '+237670000000',
    });
    const r = http.post(`${BASE_URL}/api/payments/webhook`, body, {
      headers: { 'Content-Type': 'application/json', 'x-sebpay-signature': 'smoke-test-sig' },
    });
    check(r, { 'webhook repond': (x) => [200, 401, 500].includes(x.status) });
  });

  sleep(1);

  group('3. Agents run', () => {
    const r = http.post(`${BASE_URL}/api/agents/run`, JSON.stringify({
      agentId: 'agent_smoke',
      input: 'Test de fumee',
    }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    check(r, { 'agent run repond': (x) => [200, 400, 402, 404, 500].includes(x.status) });
  });

  sleep(1);

  group('4. Credit checkout', () => {
    const r = http.post(`${BASE_URL}/api/payments/checkout`, JSON.stringify({
      type: 'credits',
      id: 'small',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    check(r, { 'checkout repond': (x) => [200, 400, 401, 500].includes(x.status) });
  });
}
