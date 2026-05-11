import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.client';
import { generateTokens } from '@orderflow/auth';
import { createLogger } from '@orderflow/logger';
import { RegisterDto, LoginDto, AuthTokens } from '@orderflow/shared-types';

const log = createLogger('order-service:auth');
const BCRYPT_COST = 12;

export const registerUser = async (dto: RegisterDto): Promise<AuthTokens> => {
  const emailHash = dto.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { emailHash } });
  if (existing) {
    const err = new Error('Email already registered');
    (err as Error & { status: number }).status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      emailHash,
      passwordHash,
      consentTimestamp: new Date(dto.consentTimestamp),
    },
  });

  log.info('User registered', { userId: user.id });
  return generateTokens(user.id, emailHash);
};

export const loginUser = async (dto: LoginDto): Promise<AuthTokens> => {
  const emailHash = dto.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { emailHash } });
  if (!user || user.deletedAt) {
    const err = new Error('Invalid credentials');
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  log.info('User logged in', { userId: user.id });
  return generateTokens(user.id, emailHash);
};

export const deleteUser = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), emailHash: `deleted_${userId}` },
  });
  await prisma.order.updateMany({
    where: { userId },
    data: { status: 'cancelled' },
  });
  log.info('User account deleted (GDPR right-to-deletion)', { userId });
};
