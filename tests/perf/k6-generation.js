// k6 load test — generation pipeline must complete p95 < 30s
// RED: /api/generate endpoint does not exist yet — fails until Wk 3
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<30000"],
    http_req_failed: ["rate<0.02"],
  },
};

export default function () {
  const res = http.post(
    "http://localhost:3000/api/generate",
    JSON.stringify({ generationId: "load-test-seed" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, {
    "status is 200 or 202": (r) => r.status === 200 || r.status === 202,
  });
  sleep(1);
}
