# Vyasa Intelligence UI

React + Vite + TailwindCSS chat interface for the `vyasa-rag-service`.

## Features

- **Streaming SSE chat** — live agent reasoning steps rendered as collapsible accordion
- **Session history sidebar** — switch between previous conversations
- **Collapsible agent trace** — shows Thought / Action / Observation / Reflection steps
- **Cancellable streams** — stop button aborts in-flight SSE connection
- **Quick-start suggestions** — pre-seeded example questions

## Tech Stack

- React 18 + TypeScript (strict)
- Vite 5 (dev proxy: `/api` → vyasa-rag-service)
- TailwindCSS 3 + Lucide icons
- Dev port: **4201**

## Setup

```bash
# From apps/vyasa-ui
npm install

# Copy env
cp .env.example .env.local
# Edit VITE_VYASA_API_URL to point to your running vyasa-rag-service
```

## Running

```bash
# Start dev server (port 4201)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## API Proxy (dev)

Vite proxies `/api/*` → `VYASA_API_URL` (default `http://localhost:3000`).
So `fetch('/api/chat')` hits `http://localhost:3000/chat` in dev.

For production, set `VITE_API_BASE_PATH` to the full API Gateway/Lambda URL,
e.g. `https://xyz.execute-api.us-east-1.amazonaws.com`.

## Environment Variables

| Variable             | Default                 | Description                |
| -------------------- | ----------------------- | -------------------------- |
| `VITE_VYASA_API_URL` | `http://localhost:3000` | Backend URL for Vite proxy |
| `VITE_API_BASE_PATH` | `/api`                  | API prefix used at runtime |
