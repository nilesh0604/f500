/**
 * Load Tests for Order Service
 *
 * Basic load tests to verify service performance under minimal load.
 * These are not full load tests but quick checks for deployment validation.
 *
 * @see Phase 5: CD Pipeline — Deployment (Weeks 7–8)
 */

import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.LOAD_TEST_USERS || '10', 10);
const DURATION_SECONDS = parseInt(process.env.LOAD_TEST_DURATION || '30', 10);
const RAMP_UP_SECONDS = 5;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  validateStatus: () => true,
});

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  errors: string[];
}

/**
 * Run a simple load test
 */
async function runLoadTest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<LoadTestResult> {
  const results: { success: boolean; duration: number; status?: number }[] = [];
  const errors: string[] = [];
  const startTime = Date.now();
  const endTime = startTime + DURATION_SECONDS * 1000;

  // Calculate requests per second based on concurrent users
  const requestsPerSecond = CONCURRENT_USERS;
  const delayBetweenRequests = 1000 / requestsPerSecond;

  const makeRequest = async (): Promise<void> => {
    const requestStart = Date.now();
    try {
      const response =
        method === 'GET'
          ? await api.get(endpoint)
          : await api.post(endpoint, body);

      const duration = Date.now() - requestStart;
      results.push({
        success: response.status < 500,
        duration,
        status: response.status,
      });
    } catch (error) {
      results.push({ success: false, duration: Date.now() - requestStart });
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  // Ramp up period
  const rampUpStart = Date.now();
  while (Date.now() < rampUpStart + RAMP_UP_SECONDS * 1000) {
    await makeRequest();
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests * 2));
  }

  // Steady state
  const steadyStatePromises: Promise<void>[] = [];
  while (Date.now() < endTime) {
    steadyStatePromises.push(makeRequest());
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
  }

  await Promise.all(steadyStatePromises);

  // Calculate statistics
  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const totalRequests = results.length;
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const avgResponseTime = durations.reduce((a, b) => a + b, 0) / totalRequests;
  const p95Index = Math.floor(durations.length * 0.95);
  const p95ResponseTime = durations[p95Index] || 0;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    avgResponseTime,
    p95ResponseTime,
    errors: errors.slice(0, 10), // Keep only first 10 errors
  };
}

describe('Load Tests', () => {
  // Only run load tests in CI or when explicitly requested
  const shouldRunLoadTests =
    process.env.CI || process.env.RUN_LOAD_TESTS === 'true';

  beforeAll(() => {
    if (!shouldRunLoadTests) {
      console.log('Skipping load tests. Set RUN_LOAD_TESTS=true to enable.');
    }
  });

  (shouldRunLoadTests ? it : it.skip)(
    'health endpoint should handle load',
    async () => {
      const result = await runLoadTest('/health');

      console.log('Load test results:', {
        totalRequests: result.totalRequests,
        successful: result.successfulRequests,
        failed: result.failedRequests,
        avgResponseTime: `${result.avgResponseTime.toFixed(2)}ms`,
        p95ResponseTime: `${result.p95ResponseTime.toFixed(2)}ms`,
      });

      // Acceptance criteria
      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.01); // < 1% errors
      expect(result.avgResponseTime).toBeLessThan(200); // < 200ms average
      expect(result.p95ResponseTime).toBeLessThan(500); // < 500ms p95
    },
    (DURATION_SECONDS + 10) * 1000
  );

  (shouldRunLoadTests ? it : it.skip)(
    'API endpoints should maintain performance',
    async () => {
      const result = await runLoadTest('/v1');

      expect(result.failedRequests / result.totalRequests).toBeLessThan(0.01);
      expect(result.avgResponseTime).toBeLessThan(300);
    },
    (DURATION_SECONDS + 10) * 1000
  );
});

describe('Stress Test', () => {
  const shouldRunStressTests = process.env.RUN_STRESS_TESTS === 'true';

  (shouldRunStressTests ? it : it.skip)(
    'should handle burst traffic',
    async () => {
      const burstSize = 50;
      const requests = Array(burstSize)
        .fill(null)
        .map(() => api.get('/health'));

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200).length;

      console.log(
        `Burst test: ${successCount}/${burstSize} succeeded in ${duration}ms`
      );

      expect(successCount).toBeGreaterThan(burstSize * 0.95); // > 95% success
      expect(duration).toBeLessThan(5000); // All responses within 5 seconds
    },
    10000
  );
});
