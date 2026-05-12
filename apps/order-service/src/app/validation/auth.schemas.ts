import { z } from 'zod';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,72}$/;

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .max(255)
    .transform(v => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(
      PASSWORD_REGEX,
      'Password must contain uppercase, lowercase, digit, and special character'
    ),
  consentTimestamp: z
    .string()
    .datetime()
    .refine(
      v => new Date(v) <= new Date(),
      'consentTimestamp must not be in the future'
    ),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform(v => v.toLowerCase().trim()),
  password: z.string().min(1).max(72),
});
