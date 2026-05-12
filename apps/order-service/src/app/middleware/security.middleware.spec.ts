import { Request, Response, NextFunction } from 'express';
import {
  strictCors,
  securityHeaders,
  requestSizeGuard,
} from './security.middleware';

const mockRes = (): jest.Mocked<Partial<Response>> & {
  headers: Record<string, string>;
} => {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((key: string, val: string) => {
      headers[key] = val;
    }) as unknown as jest.Mock,
    status: jest.fn().mockReturnThis() as unknown as jest.Mock,
    json: jest.fn().mockReturnThis() as unknown as jest.Mock,
    end: jest.fn().mockReturnThis() as unknown as jest.Mock,
  };
};

const mockNext = (): NextFunction => jest.fn();

describe('strictCors', () => {
  const ORIGINAL_ENV = process.env['CORS_ORIGIN'];

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env['CORS_ORIGIN'];
    } else {
      process.env['CORS_ORIGIN'] = ORIGINAL_ENV;
    }
  });

  it('sets CORS headers for allowed origin', () => {
    process.env['CORS_ORIGIN'] = 'https://app.orderflow.com';
    const req = {
      method: 'GET',
      headers: { origin: 'https://app.orderflow.com' },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    strictCors(req, res as unknown as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://app.orderflow.com'
    );
    expect(next).toHaveBeenCalled();
  });

  it('does not set CORS headers for unknown origin', () => {
    process.env['CORS_ORIGIN'] = 'https://app.orderflow.com';
    const req = {
      method: 'GET',
      headers: { origin: 'https://evil.com' },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    strictCors(req, res as unknown as Response, next);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('returns 204 for preflight from allowed origin', () => {
    process.env['CORS_ORIGIN'] = 'https://app.orderflow.com';
    const req = {
      method: 'OPTIONS',
      headers: { origin: 'https://app.orderflow.com' },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    strictCors(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for preflight from unknown origin', () => {
    process.env['CORS_ORIGIN'] = 'https://app.orderflow.com';
    const req = {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.com' },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    strictCors(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows same-origin requests (no Origin header)', () => {
    process.env['CORS_ORIGIN'] = 'https://app.orderflow.com';
    const req = {
      method: 'GET',
      headers: {},
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    strictCors(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('securityHeaders', () => {
  it('sets required security headers', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    securityHeaders(req, res as unknown as Response, next);

    expect(res.headers['Content-Security-Policy']).toContain(
      "default-src 'none'"
    );
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['X-XSS-Protection']).toBe('0');
    expect(res.headers['Referrer-Policy']).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(res.headers['Permissions-Policy']).toContain('camera=()');
    expect(next).toHaveBeenCalled();
  });

  it('does not set HSTS header in development', () => {
    const orig = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    securityHeaders(req, res as unknown as Response, next);

    expect(res.headers['Strict-Transport-Security']).toBeUndefined();

    process.env['NODE_ENV'] = orig;
  });

  it('sets HSTS header in production', () => {
    const orig = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    const req = {} as Request;
    const res = mockRes();
    const next = mockNext();

    securityHeaders(req, res as unknown as Response, next);

    expect(res.headers['Strict-Transport-Security']).toContain('max-age=');

    process.env['NODE_ENV'] = orig;
  });
});

describe('requestSizeGuard', () => {
  it('calls next for small payloads', () => {
    const req = {
      method: 'POST',
      headers: { 'content-length': '1024' },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    requestSizeGuard(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks oversized POST payloads', () => {
    const req = {
      method: 'POST',
      headers: { 'content-length': String(200 * 1024) },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    requestSizeGuard(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Payload Too Large' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows oversized GET requests (read-only)', () => {
    const req = {
      method: 'GET',
      headers: { 'content-length': String(200 * 1024) },
    } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    requestSizeGuard(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
