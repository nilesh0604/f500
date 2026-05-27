# CLAUDE.md — Vyasa Intelligence UI

## Overview

React 18 + Vite + TailwindCSS chat interface for the `vyasa-rag-service`.
Deployed to S3 + CloudFront.

- **Dev/Internal**: `https://d2j5xbveesoc8s.cloudfront.net`
- **External/Production**: `https://vyasa.nshinde.xyz`

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Vyasa UI (SPA)                     │
│  React 18 + Vite + TailwindCSS + Lucide              │
│                                                       │
│  App.tsx                                              │
│  ├── SessionSidebar  (session list + new chat)       │
│  └── ChatPage                                         │
│       ├── MessageBubble  (user/assistant messages)   │
│       │    └── AgentSteps  (collapsible ReAct trace) │
│       └── ChatInput  (auto-resize textarea)          │
└──────────────────────┬───────────────────────────────┘
                       │ fetch /api/chat/stream (SSE)
                       ▼
┌──────────────────────────────────────────────────────┐
│         vyasa-rag-service (Lambda + Bedrock)          │
│         API Gateway: t859xz8d3c.execute-api           │
└──────────────────────────────────────────────────────┘
```

---

## Key Files

| File                                | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `src/App.tsx`                       | Root layout — sidebar toggle, header, chat page        |
| `src/hooks/useChat.ts`              | State hook — messages, sessions, streaming, abort      |
| `src/services/vyasa.service.ts`     | API client — `/chat`, `/chat/stream` (SSE), `/health`  |
| `src/types.ts`                      | `ChatMessage`, `Session`, `AgentStep`, `ChatResponse`  |
| `src/components/ChatPage.tsx`       | Main chat layout with auto-scroll                      |
| `src/components/ChatInput.tsx`      | Auto-resizing textarea with quick-start suggestions    |
| `src/components/MessageBubble.tsx`  | User/assistant message rendering with streaming cursor |
| `src/components/AgentSteps.tsx`     | Collapsible accordion of ReAct agent reasoning steps   |
| `src/components/SessionSidebar.tsx` | Session history sidebar with new-conversation button   |
| `vite.config.ts`                    | Dev server port 4201, `/api` proxy to RAG service      |

---

## Tech Stack

- **React 18** — functional components, hooks only (no class components)
- **Vite** — dev server + build tool
- **TailwindCSS 3** — utility-first styling
- **Lucide React** — icon library (sidebar toggle icons)
- **uuid** — client-side session/message ID generation
- **TypeScript 5.5** — strict mode

---

## API Integration

All API calls go through `src/services/vyasa.service.ts`:

- **`sendChatStream()`** — primary path, SSE streaming with ReAct agent steps
- **`sendChat()`** — fallback non-streaming, returns full response
- **`checkHealth()`** — GET `/health` endpoint

**SSE event types:** `thought`, `action`, `observation`, `reflection`, `message`, `done`, `error`

Base path: `VITE_API_BASE_PATH` env var (default `/api`)

---

## Environment Variables

| Variable             | Default                 | Description                    |
| -------------------- | ----------------------- | ------------------------------ |
| `VITE_API_BASE_PATH` | `/api`                  | API base path prefix           |
| `VITE_VYASA_API_URL` | `http://localhost:3000` | Backend URL for Vite dev proxy |

---

## Development

```bash
# Install dependencies (from repo root)
npm install

# Dev server (port 4201, proxies /api → RAG service)
cd apps/vyasa-ui && npm run dev

# Production build
cd apps/vyasa-ui && npm run build

# Preview production build
cd apps/vyasa-ui && npm run preview

# Lint
cd apps/vyasa-ui && npm run lint
```

---

## Deployment

Deployed via `.github/workflows/vyasa-ui-cd.yml`:

1. Build → `dist/` output
2. S3 sync with immutable cache headers for hashed assets
3. CloudFront invalidation for `index.html`

**Live URLs:**

- Dev/Internal: `https://d2j5xbveesoc8s.cloudfront.net` (use during development)
- External/Production: `https://vyasa.nshinde.xyz` (custom domain for end users)

CloudFront `/api/*` behaviour proxies to the Vyasa RAG API Gateway endpoint.

---

## Code Conventions

- Functional components only — no class components
- Custom hooks in `src/hooks/` for state management
- Service functions in `src/services/` for API calls
- Types in `src/types.ts` — shared across components
- TailwindCSS for all styling — no CSS modules or styled-components
- `useCallback` for event handlers passed as props
- Abort controller pattern for cancellable streams
