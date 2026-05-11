import jwt from 'jsonwebtoken';
import { JwtPayload } from '@orderflow/shared-types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

const getPrivateKey = (): string => {
  const key = process.env['JWT_PRIVATE_KEY'];
  if (!key) throw new Error('JWT_PRIVATE_KEY env var is not set');
  return key.replace(/\\n/g, '\n');
};

const getPublicKey = (): string => {
  const key = process.env['JWT_PUBLIC_KEY'];
  if (!key) throw new Error('JWT_PUBLIC_KEY env var is not set');
  return key.replace(/\\n/g, '\n');
};

export const generateTokens = (userId: string, email: string): TokenPair => {
  const accessToken = jwt.sign({ email }, getPrivateKey(), {
    subject: userId,
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_TTL,
  });

  const refreshToken = jwt.sign({}, getPrivateKey(), {
    subject: userId,
    algorithm: 'RS256',
    expiresIn: REFRESH_TOKEN_TTL,
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
};

export const verifyAccessToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, getPublicKey(), {
    algorithms: ['RS256'],
  });
  return decoded as JwtPayload;
};
