/**
 * Smoke Tests for Order Service
 *
 * These tests verify basic functionality after deployment.
 * They are fast, non-destructive, and should pass in any environment.
 *
 * @see Phase 5: CD Pipeline — Deployment (Weeks 7–8)
 */

import axios from 'axios';

// Get base URL from environment or command line
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 30000; // 30 seconds

// Create axios instance with defaults
const api = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  validateStatus: () => true, // Don't throw on non-2xx
});

describe('Smoke Tests', () => {
  describe('Health Endpoints', () => {
    it('should return 200 on /health', async () => {
      const response = await api.get('/health');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: expect.any(String),
      });
    });

    it('should return 200 on /ready', async () => {
      const response = await api.get('/ready');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        ready: true,
      });
    });

    it('should return 200 on /live', async () => {
      const response = await api.get('/live');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        alive: true,
      });
    });
  });

  describe('API Endpoints', () => {
    it('should return API info on root path', async () => {
      const response = await api.get('/v1');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('name');
      expect(response.data).toHaveProperty('version');
    });

    it('should return 401 without auth for protected endpoints', async () => {
      const response = await api.get('/v1/orders');

      expect(response.status).toBe(401);
    });
  });

  describe('Authentication', () => {
    it('should reject invalid credentials', async () => {
      const response = await api.post('/v1/auth/login', {
        email: 'invalid@test.com',
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await api.post('/v1/auth/login', {
        // Missing required fields
      });

      expect(response.status).toBe(400);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await api.options('/v1/orders', {
        headers: {
          Origin: 'http://example.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Response Time', () => {
    it('should respond to health check within 500ms', async () => {
      const start = Date.now();
      await api.get('/health');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Content Negotiation', () => {
    it('should return JSON by default', async () => {
      const response = await api.get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});

describe('Critical User Journey', () => {
  // These tests simulate critical user paths without modifying data

  it('should expose metrics endpoint', async () => {
    const response = await api.get('/metrics');

    // Metrics endpoint may or may not be exposed depending on config
    expect([200, 404]).toContain(response.status);
  });

  it('should handle 404 gracefully', async () => {
    const response = await api.get('/nonexistent/path');

    expect(response.status).toBe(404);
    expect(response.data).toHaveProperty('message');
  });

  it('should handle invalid JSON gracefully', async () => {
    const response = await api.post('/v1/auth/login', 'invalid json {', {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
  });
});

// Run only if explicitly requested
if (process.env.RUN_SMOKE_TESTS) {
  describe('Extended Smoke Tests', () => {
    it('should handle concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() => api.get('/health'));

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
}
