/**
 * k6 Baseline Load Test — Order Service
 * Target : 500 RPS sustained for 10 minutes
 * Pass criteria (SLO gates):
 *   p95 latency < 200 ms
 *   p99 latency < 500 ms
 *   error rate  < 0.1 %
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const orderLatency = new Trend('order_latency', true);

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.001'],
    order_latency: ['p(95)<200'],
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
  orderLatency.add(listRes.timings.duration);

  check(listRes, {
    'list orders 200': r => r.status === 200,
    'list orders < 200ms': r => r.timings.duration < 200,
  });

  sleep(0.1);
}
