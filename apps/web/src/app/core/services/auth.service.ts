import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  consentTimestamp: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

const ACCESS_TOKEN_KEY = 'of_access_token';
const REFRESH_TOKEN_KEY = 'of_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1/auth`;

  register(payload: RegisterRequest): Observable<AuthTokens> {
    return this.http
      .post<AuthTokens>(`${this.base}/register`, payload)
      .pipe(tap(tokens => this.storeTokens(tokens)));
  }

  login(payload: LoginRequest): Observable<AuthTokens> {
    return this.http
      .post<AuthTokens>(`${this.base}/login`, payload)
      .pipe(tap(tokens => this.storeTokens(tokens)));
  }

  logout(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  private storeTokens(tokens: AuthTokens): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}
