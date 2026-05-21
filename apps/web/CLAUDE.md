# CLAUDE.md — web (Angular frontend)

## Responsibility

Angular 18 SPA — 3 screens: Login/Register, Order List, Order Detail.
Served via CloudFront CDN (S3 bucket). Real-time updates via Socket.IO WebSocket.
Owner: platform-team | Dev port: 4200

---

## Domain Rules

- Authentication tokens stored in `sessionStorage` only — never `localStorage` (XSS risk)
- Idempotency key for order creation: UUID generated client-side (`crypto.randomUUID()`)
- Cursor-based pagination on order list — "Load more" pattern, never page numbers
- Real-time status updates arrive via WebSocket (`order:status_changed` event) — update NgRx store directly, do NOT re-fetch from API
- All monetary values displayed as dollars (divide cents by 100) — stored as cents in backend

---

## Tech Stack

- Angular 18 + TypeScript strict
- NgRx Signal Store (`@ngrx/signals`) for state management — no Redux-style reducers
- Angular Material 18 for UI components
- SCSS with BEM convention (max nesting depth: 3)
- Socket.IO client 4.x for WebSocket
- Jest + jest-preset-angular for unit tests
- Cypress for E2E tests (`apps/web-e2e/`)

---

## State Management (NgRx Signal Store)

```
AuthStore      isAuthenticated, isLoading, error
               methods: init, login, register, logout

OrdersStore    orders[], selectedOrder, pagination state
               methods: loadOrders, loadOrder, createOrder,
                        updateOrderStatus, applyRealtimeUpdate
```

Always update store via store methods — never mutate state directly.
Use `applyRealtimeUpdate` for WebSocket-driven updates.

---

## Source Structure

```
src/app/
  core/
    services/       auth.service.ts, order.service.ts, websocket.service.ts, toast.service.ts
    interceptors/   auth.interceptor.ts (attaches JWT), error.interceptor.ts
    guards/         auth.guard.ts
  store/
    auth.store.ts
    orders.store.ts
  features/
    auth/           login/, register/
    orders/         order-list/, order-detail/, create-order-dialog/
  shared/
    components/     toast/, skeleton/, status-badge/
```

---

## API Consumption

Dev proxy: `/v1` → `http://localhost:3001`, `/socket.io` → `http://localhost:3002`

Auth endpoints:

- `POST /v1/auth/register` — `{ email, password, consentTimestamp }`
- `POST /v1/auth/login` — returns `{ accessToken, refreshToken }`

Order endpoints:

- `GET /v1/orders?cursor=&limit=&status=`
- `POST /v1/orders` — header: `Idempotency-Key: <uuid>`
- `GET /v1/orders/:id`
- `PATCH /v1/orders/:id/status`

All requests: `Authorization: Bearer <accessToken>` header via `auth.interceptor.ts`.
On 401: redirect to `/auth/login` automatically.

---

## Testing Standards

- Unit test coverage: 80% threshold (branches, functions, lines, statements)
- Tests alongside source files: `*.spec.ts`
- Mock `crypto.randomUUID` in `beforeEach` — jsdom does not expose it
- E2E: Cypress with `cypress-axe` for WCAG 2.1 AA accessibility checks
- Lighthouse CI: performance ≥ 0.90, accessibility ≥ 0.95

---

## Local Dev

```bash
# Start backend dependencies first
docker compose up -d

# Run Angular dev server
npx nx serve web

# Run unit tests
npx nx test web

# Run E2E tests (needs dev server running)
npx nx e2e web-e2e

# Lint (ESLint + Stylelint)
npx nx lint web
npm run stylelint
```

---

## SCSS Rules (enforced by Stylelint)

- BEM class naming: `.block__element--modifier`
- No named colors — use SCSS variables from `src/styles/_variables.scss`
- Max nesting depth: 3
- SCSS variable naming: `$kebab-case`
