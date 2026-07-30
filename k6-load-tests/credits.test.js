// ============================================================
// k6 Load Test — Credits (consommation + recharge simultanee)
// Simule 200 utilisateurs en pic rechargeant/consommant
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export const options = {
  stages: [
    { duration: '10s', target: 50 },   // Montee
    { duration: '30s', target: 200 },  // Pic a 200 utilisateurs
    { duration: '20s', target: 100 },  // Plateau
    { duration: '10s', target: 0 },    // Descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<8000'],
    http_req_failed: ['rate<0.03'],
    credit_errors: ['rate<0.05'],
  },
};

const creditErrorRate = new Rate('credit_errors');
const checkoutDuration = new Trend('checkout_duration');
const balanceCheckDuration = new Trend('balance_check_duration');

export default function () {
  group('Credits - Checkout + Consommation', () => {
    const userId = `user_loadtest_${Math.floor(Math.random() * 1000)}`;
    
    // Generer un JWT mock pour le checkout
    // En production, utilisez un vrai token
    const mockToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test';

    // 70% des requetes: recharger des credits
    if (Math.random() < 0.7) {
      const packs = ['small', 'medium', 'large', 'xlarge'];
      const pack = packs[Math.floor(Math.random() * packs.length)];

      const payload = JSON.stringify({ type: 'credits', id: pack });
      
      const start = Date.now();
      const res = http.post(`${BASE_URL}/api/payments/checkout`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockToken}`,
        },
        timeout: '10s',
      });
      const duration = Date.now() - start;
      checkoutDuration.add(duration);

      check(res, {
        'checkout status 200 ou 401': (r) => r.status === 200 || r.status === 401,
        'checkout contient success': (r) => {
          try {
            return JSON.parse(r.body).success === true;
          } catch { return false; }
        },
      });

      if (res.status !== 200) {
        creditErrorRate.add(1);
      }
    } 
    // 30% des requetes: verifier les plans
    else {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/api/payments/plans`);
      const duration = Date.now() - start;
      balanceCheckDuration.add(duration);

      check(res, {
        'plans status 200': () => res.status === 200,
        'plans contiennent les 4 niveaux': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success && body.data.length === 4;
          } catch { return false; }
        },
      });
    }
  });

  sleep(0.3);
}
