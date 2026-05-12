import { registerSchema, loginSchema } from './auth.schemas';

describe('registerSchema', () => {
  const valid = {
    email: 'User@Example.COM',
    password: 'Secure@1234',
    consentTimestamp: new Date(Date.now() - 1000).toISOString(),
  };

  it('accepts valid input and normalises email to lowercase', () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects weak passwords (no special char)', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'Secure1234',
    });
    expect(result.success).toBe(false);
  });

  it('rejects passwords shorter than 8 chars', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'Ab1!' });
    expect(result.success).toBe(false);
  });

  it('rejects passwords longer than 72 chars', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'Aa1!' + 'x'.repeat(70),
    });
    expect(result.success).toBe(false);
  });

  it('rejects future consentTimestamp', () => {
    const result = registerSchema.safeParse({
      ...valid,
      consentTimestamp: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({
      ...valid,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials and lowercases email', () => {
    const result = loginSchema.safeParse({
      email: 'USER@EXAMPLE.COM',
      password: 'anything',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password longer than 72 chars', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'x'.repeat(73),
    });
    expect(result.success).toBe(false);
  });
});
