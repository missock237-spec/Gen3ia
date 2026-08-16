import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '20s', target: 30 },
    { duration: '40s', target: 80 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<4000'],
    http_req_failed: ['rate<0.05'],
  },
};

const queueErrorRate = new Rate('queue_errors');
const queueDuration = new Trend('queue_enqueue_duration');

export default function _default() {
  group('BullMQ - Enqueue taches', () => {
    const tasks = ['agent.run','workflow.execute','memory.index','webhook.deliver','email.send'];
    const t = tasks[Math.floor(Math.random()*tasks.length)];
    const p = JSON.stringify({
      taskType: t,
      priority: Math.floor(Math.random()*5)+1,
      data: {
        userId: `user_bmq_${Math.floor(Math.random()*100)}`,
        timestamp: Date.now(),
        payload: { id: `task_${Date.now()}`, type: t, params: { k:'v', c:Math.floor(Math.random()*100) } },
      },
    });
    const start = Date.now();
    const r = http.post(`${BASE_URL}/api/tasks`, p, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    queueDuration.add(Date.now()-start);
    check(r, { 'enqueue 200/201': (x) => x.status===200||x.status===201 });
    if (r.status!==200&&r.status!==201) queueErrorRate.add(1);
  });
  sleep(0.8);
}
