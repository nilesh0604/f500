/**
 * k6 Spike Test — Order Service
 * Target : ramp to 2000 RPS over 30 s, sustain 2 min, ramp down 30 s
 * Pass criteria (SLO gates):
 *   p95 latency < 500 ms during spike
 *   error rate  < 1 %
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 2000 },
        { duration: '2m', target: 2000 },
        { duration: '30s', target: 100 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  };

  const listRes = http.get(`${BASE_URL}/v1/orders?limit=20`, params);
  errorRate.add(listRes.status >= 400);

  check(listRes, {
    'spike: list orders not 5xx': r => r.status < 500,
    'spike: latency < 500ms': r => r.timings.duration < 500,
  });

  sleep(0.05);
}
