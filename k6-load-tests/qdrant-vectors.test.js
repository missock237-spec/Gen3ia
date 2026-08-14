// ============================================================
// k6 Load Test — Qdrant Vector Search
// Simule 50 utilisateurs faisant des recherches vectorielles
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.02'],
  },
};

const searchErrorRate = new Rate('vector_search_errors');
const searchDuration = new Trend('vector_search_duration');

export default function () {
  group('Vector Search - RAG Retrieval', () => {
    const queries = [
      'Quelle est la capitale du Cameroun ?',
      'Comment installer Gen3ia avec Docker ?',
      'Documentation API pour les webhooks',
      'Configuration du monitoring Prometheus',
      'Systeme de credits et abonnements',
    ];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/rag/retrieve`, JSON.stringify({
      query,
      topK: 5,
      useReranking: true,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      timeout: '10s',
    });
    const duration = Date.now() - start;
    searchDuration.add(duration);

    check(res, {
      'status 200': (r) => r.status === 200,
      'temps reponse < 5s': () => duration < 5000,
      'reponse contient results': (r) => {
        try {
          const b = JSON.parse(r.body);
          return b.results !== undefined || b.success === true;
        } catch { return false; }
      },
    });

    if (res.status !== 200) {
      searchErrorRate.add(1);
    }
  });

  sleep(Math.random() * 2 + 0.5);
}
