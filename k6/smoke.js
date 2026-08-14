import http from "k6/http";
import { check, sleep } from "k6";
import { baseUrl, baseHeaders } from "./helpers.js";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

const API_KEY = __ENV.K6_API_KEY;

export default function () {
  const res = http.get(`${baseUrl}/api/health`, { headers: baseHeaders(API_KEY), tags: { name: "health" } });
  check(res, {
    "health status 200": (r) => r.status === 200,
    "réponse rapide": (r) => r.timings.duration < 300,
  });
  sleep(1);
}
