# ADR-007: Authentication Approach

## Status

Accepted

## Context

OrderFlow requires user authentication for:

- Protecting order data (users see only their orders)
- Preventing unauthorized order creation/modification
- Session management

Options considered:

1. **Session cookies**: Server-side sessions, cookie-based
2. **JWT (JSON Web Tokens)**: Stateless, token-based
3. **OAuth 2.0 / OpenID Connect**: Third-party identity providers
4. **AWS Cognito**: Managed authentication service

## Decision

We will use **JWT (JSON Web Tokens) with RS256 signing**:

- **Access tokens**: JWT with 15-minute lifetime
- **Refresh tokens**: JWT with 7-day lifetime
- **Algorithm**: RS256 (RSA with SHA-256) - asymmetric signing
- **Storage**: HTTP-only, Secure, SameSite=Strict cookies

## Consequences

### Positive

- **Stateless**: No server-side session storage needed
- **Scalable**: Any service can validate tokens with public key
- **Performance**: No database lookup for session validation
- **Standard**: JWT is industry standard, well understood
- **Security**: RS256 allows key rotation without client changes

### Negative

- **Token size**: JWTs are larger than session IDs
- **Revocation complexity**: Cannot easily revoke tokens before expiry
- **Key management**: Must securely manage private keys
- **Clock skew**: Token validation sensitive to clock differences

### Mitigations

- Short access token lifetime (15 min)
- Refresh token rotation on use
- Blacklist for revoked refresh tokens (Redis)
- Secure key storage in AWS Secrets Manager
- Automatic key rotation every 90 days

## Token Structure

### Access Token Payload

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "iat": 1699953600,
  "exp": 1699954500,
  "jti": "unique-token-id"
}
```

### Refresh Token Payload

```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "iat": 1699953600,
  "exp": 1700558400,
  "jti": "unique-refresh-token-id"
}
```

## Implementation

### Authentication Flow

```
1. User POST /v1/auth/login (email, password)
2. Server validates credentials (bcrypt)
3. Server issues:
   - Access token (15 min, RS256 signed)
   - Refresh token (7 days, RS256 signed)
4. Client stores in HTTP-only cookies
5. Client sends access token in Authorization header
6. Server validates signature with public key
7. When access token expires, client uses refresh token
8. Server validates refresh token, issues new pair
```

### Password Security

- **Hashing**: bcrypt with cost factor 12
- **Salt**: Per-password unique salt (bcrypt handles this)
- **PII**: Email encrypted at rest (AES-256)

### Cookie Configuration

```
Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=900
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

## API Endpoints

```
POST /v1/auth/register    - Create account
POST /v1/auth/login       - Authenticate
POST /v1/auth/refresh     - Refresh tokens
POST /v1/auth/logout      - Invalidate session
DELETE /v1/auth/me        - Delete account (GDPR)
```

## Security Considerations

1. **Brute force protection**: Rate limiting on auth endpoints
2. **CSRF protection**: SameSite=Strict cookies + CSRF token for state-changing ops
3. **XSS mitigation**: HTTP-only cookies (not accessible to JavaScript)
4. **MITM protection**: Secure flag (HTTPS only)
5. **Token theft**: Short-lived access tokens minimize window
6. **Key compromise**: RS256 allows quick key rotation

## GDPR Compliance

- Consent timestamp stored on registration
- Right to deletion: DELETE /v1/auth/me
- Data export capability (future)
- Audit log of all authentication events

## Related Decisions

- ADR-003: Database per Service (user data in Order Service)
- ADR-006: Observability Strategy (log auth events with correlation ID)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
