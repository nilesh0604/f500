import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AuthService, AuthTokens } from './auth.service';

const mockTokens: AuthTokens = {
  accessToken:
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.sig',
  refreshToken: 'refresh-token-abc',
  expiresIn: 900,
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should POST credentials and store tokens', () => {
      service
        .login({ email: 'test@example.com', password: 'Pass1234!' })
        .subscribe(tokens => {
          expect(tokens.accessToken).toBe(mockTokens.accessToken);
          expect(sessionStorage.getItem('of_access_token')).toBe(
            mockTokens.accessToken
          );
          expect(sessionStorage.getItem('of_refresh_token')).toBe(
            mockTokens.refreshToken
          );
        });

      const req = httpMock.expectOne(
        r => r.url.includes('/v1/auth/login') && r.method === 'POST'
      );
      req.flush(mockTokens);
    });
  });

  describe('register', () => {
    it('should POST registration payload and store tokens', () => {
      service
        .register({
          email: 'new@example.com',
          password: 'Pass1234!',
          consentTimestamp: '2026-01-01T00:00:00Z',
        })
        .subscribe(tokens => {
          expect(tokens.accessToken).toBeTruthy();
        });

      const req = httpMock.expectOne(
        r => r.url.includes('/v1/auth/register') && r.method === 'POST'
      );
      req.flush(mockTokens);
    });
  });

  describe('logout', () => {
    it('should clear tokens from sessionStorage', () => {
      sessionStorage.setItem('of_access_token', 'token');
      sessionStorage.setItem('of_refresh_token', 'refresh');
      service.logout();
      expect(sessionStorage.getItem('of_access_token')).toBeNull();
      expect(sessionStorage.getItem('of_refresh_token')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token', () => {
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return false for expired token', () => {
      const expiredPayload = btoa(JSON.stringify({ sub: 'user-1', exp: 1 }));
      sessionStorage.setItem('of_access_token', `header.${expiredPayload}.sig`);
      expect(service.isAuthenticated()).toBe(false);
    });
  });
});
