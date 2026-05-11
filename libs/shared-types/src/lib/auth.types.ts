export interface User {
  id: string;
  emailHash: string;
  passwordHash: string;
  consentTimestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterDto {
  email: string;
  password: string;
  consentTimestamp: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthenticatedRequest {
  userId: string;
  email: string;
}
