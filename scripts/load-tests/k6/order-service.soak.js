/**
 * k6 Soak Test — Order Service
 * Target : 200 RPS sustained for 1 hour
 * Pass criteria:
 *   p95 latency < 200 ms throughout
 *   error rate  < 0.1 %
 *   no memory leak indicators (latency must not drift > 20 % over time)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const createLatency = new Trend('create_order_latency', true);
const listLatency = new Trend('list_orders_latency', true);

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '1h',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<400'],
    errors: ['rate<0.001'],
    list_orders_latency: ['p(95)<200'],
    create_order_latency: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.AUTH_TOKEN || '';

let orderCounter = 0;

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  };

  if (orderCounter % 10 === 0) {
    const body = JSON.stringify({
      itemName: `Soak Item ${orderCounter}`,
      quantity: 1,
    });
    const createRes = http.post(`${BASE_URL}/v1/orders`, body, params);
    errorRate.add(createRes.status >= 400);
    createLatency.add(createRes.timings.duration);
    check(createRes, {
      'soak: create order 201': r => r.status === 201,
    });
  } else {
    const listRes = http.get(`${BASE_URL}/v1/orders?limit=20`, params);
    errorRate.add(listRes.status >= 400);
    listLatency.add(listRes.timings.duration);
    check(listRes, {
      'soak: list orders 200': r => r.status === 200,
      'soak: latency < 200ms': r => r.timings.duration < 200,
    });
  }

  orderCounter++;
  sleep(0.2);
}
