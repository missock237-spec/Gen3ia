// ============================================================
// k6 Load Test — POST /api/agents/run
// Simule 50 utilisateurs concurrents executant des agents
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Montee progressive
    { duration: '1m', target: 50 },   // Pic a 50 utilisateurs
    { duration: '30s', target: 0 },   // Descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

const agentRunErrorRate = new Rate('agent_run_errors');
const agentRunDuration = new Trend('agent_run_duration');

export default function () {
  group('Agents Run - Cycle complet', () => {
    const agentId = `agent_${Math.floor(Math.random() * 10) + 1}`;
    const inputs = [
      'Resume ce document en 3 points',
      'Traduis en anglais: Bonjour le monde',
      'Quelle est la capital du Cameroun ?',
      'Ecris un email professionnel',
      'Analyse les tendances du marche',
    ];
    const input = inputs[Math.floor(Math.random() * inputs.length)];

    const payload = JSON.stringify({ agentId, input });
    const params = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'x-forwarded-for': `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      },
      timeout: '30s',
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/agents/run`, payload, params);
    const duration = Date.now() - start;
    agentRunDuration.add(duration);

    check(res, {
      'status est 200 ou 402': (r) => r.status === 200 || r.status === 402,
      'temps de reponse < 10s': () => duration < 10000,
      'reponse contient success ou error': (r) => {
        try { const b = JSON.parse(r.body); return b.success !== undefined || b.error !== undefined; }
        catch { return false; }
      },
    });

    if (res.status !== 200) {
      agentRunErrorRate.add(1);
    } else {
      try {
        const b = JSON.parse(res.body);
        if (b.creditsCharged !== undefined) {
          check(res, { 'credits charges >= 1': () => b.creditsCharged >= 1 });
        }
      } catch {}
    }
  });

  sleep(Math.random() * 3 + 1);
}
