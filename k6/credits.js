import http from "k6/http";
import { check, sleep } from "k6";
import { baseUrl, baseHeaders } from "./helpers.js";

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "2m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
  },
};

const API_KEY = __ENV.K6_API_KEY;

export default function () {
  const payload = JSON.stringify({ userId: "load-user", amount: 10 });
  const res = http.post(`${baseUrl}/api/credits/issue`, payload, {
    headers: baseHeaders(API_KEY),
    tags: { name: "credit" },
  });
  check(res, {
    "200 autorisé ou 429 rate-limit attendu": (r) => r.status === 200 || r.status === 429,
  });
  sleep(0.5);
}
