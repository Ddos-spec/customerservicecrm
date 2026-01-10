# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant WhatsApp CRM SaaS with real-time chat, role-based access control (RBAC), and WhatsApp gateway integration via Go WhatsApp Gateway (whatsmeow).

## Architecture

```
customerservicecrm/
├── frontend/          # React 19 + TypeScript + Vite + Tailwind CSS 4
├── backend/           # Node.js + Express 5 + Redis (API & Auth)
├── backend/wa-gateway/        # Go + whatsmeow (WhatsApp Protocol)
└── docs/              # Documentation
```

**System Flow:**
```
[Frontend] → [Node.js Backend :3000] → [Go Gateway :3001] → [WhatsApp]
                       ↑                      ↓
                [WebSocket]          [Webhook POST]
                       ↑                      ↓
              [Real-time updates] ← [Incoming messages]
```

**Frontend-Backend Communication:**
- Frontend calls backend API via Axios (`/api/v1/*`)
- WebSocket for real-time session updates
- Session-based auth with Redis store

**Backend-Gateway Communication:**
- Node.js calls Go gateway via HTTP (`/api/v1/whatsapp/*`)
- Go gateway sends webhooks to Node.js (`/api/v1/webhook/incoming`)
- JWT authentication between services

**Role Hierarchy:**
- `super_admin` → System-wide access, tenant management
- `admin_agent` → Tenant admin, can manage agents
- `agent` → Limited to chat workspace and history

**Key Patterns:**
- ProtectedRoute component enforces RBAC
- Zustand store (`useAuthStore`) for auth state
- Demo mode bypasses API with mock data
- Session tokens stored encrypted on disk

## Commands

### Root Level
```bash
npm run doctor        # Lint + type check
npm run doctor:fix    # Auto-fix lint/format issues
docker-compose up     # Start all services
```

### Frontend (`cd frontend`)
```bash
npm run dev           # Vite dev server (port 5173)
npm run build         # Production build (tsc + vite)
npm run lint          # ESLint check
```

### Backend (`cd backend`)
```bash
npm run dev           # Nodemon with auto-reload
npm run start         # Production with GC (node --expose-gc)
npm test              # Jest tests
```

### Go Gateway (`cd backend/wa-gateway`)
```bash
make run              # Development mode
make build            # Build binary
docker build .        # Build container
```

## Environment Setup

**Backend `.env` (required):**
```
SESSION_SECRET=<random_string>
ENCRYPTION_KEY=<64_char_hex>
REDIS_URL=redis://localhost:6379
WA_GATEWAY_URL=http://localhost:3001/api/v1/whatsapp
WA_GATEWAY_PASSWORD=<gateway_auth_password>
```

**Go Gateway `.env` (required):**
```
SERVER_PORT=3001
REDIS_URL=redis://localhost:6379
WEBHOOK_URL=http://localhost:3000/api/v1/webhook/incoming
WHATSAPP_DATASTORE_TYPE=postgres
WHATSAPP_DATASTORE_URI=postgres://user:pass@localhost:5432/whatsapp
AUTH_BASIC_PASSWORD=<same_as_WA_GATEWAY_PASSWORD>
AUTH_JWT_SECRET=<jwt_secret>
```

**Frontend:** Set `VITE_API_URL` for production API endpoint.

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Router config, content protection |
| `frontend/src/store/useAuthStore.ts` | Auth state (Zustand) |
| `frontend/src/components/ProtectedRoute.tsx` | Role-based route guard |
| `backend/index.js` | Express server, session management |
| `backend/api_v1.js` | All API endpoints |
| `backend/wa-gateway-client.js` | HTTP client for Go gateway |
| `backend/wa-socket-compat.js` | Baileys-compatible wrapper |
| `backend/webhook-handler.js` | Incoming message handler |
| `backend/wa-gateway/pkg/whatsapp/whatsapp.go` | WhatsApp client (whatsmeow) |
| `backend/wa-gateway/pkg/webhook/webhook.go` | Outgoing webhook system |
| `backend/wa-gateway/pkg/events/handler.go` | Message event handler |

## Deployment

**Docker Compose (recommended):**
```bash
docker-compose up -d redis postgres wa-gateway backend
```

**Manual:**
- **Frontend:** Vercel (auto-deploy from main)
- **Backend:** VPS with Node.js 18+, Redis
- **Go Gateway:** VPS with Go 1.21+, PostgreSQL

## Demo Mode

Login page has demo credentials that bypass real API:
- Admin Agent: `admin@tokomaju.com`
- User Agents: `siti@tokomaju.com`, `budi@tokomaju.com`, `dewi@tokomaju.com`
- Super Admin: `admin@localhost` (subtle link)

Demo uses role `agent` for user agents, `admin_agent` for admin.

## Agent Slot Limits

Both demo and production enforce **4 agent slots** per tenant (1 admin + 3 user agents).

## Gateway API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/login` | POST | Login with QR code |
| `/login/pair` | POST | Login with pairing code |
| `/logout` | POST | Logout session |
| `/send/text` | POST | Send text message |
| `/send/image` | POST | Send image |
| `/send/document` | POST | Send document |
| `/send/audio` | POST | Send audio |
| `/send/video` | POST | Send video |
| `/send/location` | POST | Send location |
| `/send/contact` | POST | Send contact |
| `/group` | GET | Get joined groups |
| `/registered` | GET | Check if number is on WhatsApp |

## Webhook Events

Go gateway sends these events to Node.js:
- `message` - Incoming message
- `receipt` - Read/delivered receipt
- `typing` - Typing indicator
- `presence` - Online/offline status
- `connection` - Session connected/disconnected
