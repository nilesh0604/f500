import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  consentTimestamp: z.string().datetime(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
