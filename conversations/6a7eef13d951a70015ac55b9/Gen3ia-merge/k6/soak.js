import http from "k6/http";
import { check, sleep } from "k6";
import { baseUrl, baseHeaders } from "./helpers.js";

export const options = {
  vus: 30,
  duration: "30m",
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.02"],
  },
};

const API_KEY = __ENV.K6_API_KEY;

export default function () {
  const res = http.get(`${baseUrl}/api/agents?page=1`, { headers: baseHeaders(API_KEY), tags: { name: "agents" } });
  check(res, { "agents 200": (r) => r.status === 200 });
  sleep(2);
}
