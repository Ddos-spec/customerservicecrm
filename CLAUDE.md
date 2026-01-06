# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant WhatsApp CRM SaaS with real-time chat, role-based access control (RBAC), and WhatsApp gateway integration via Baileys.

## Architecture

```
customerservicecrm/
├── frontend/          # React 19 + TypeScript + Vite + Tailwind CSS 4
├── backend/           # Node.js + Express 5 + Baileys (WhatsApp API) + Redis
└── docs/              # Documentation
```

**Frontend-Backend Communication:**
- Frontend calls backend API via Axios (`/api/v1/*`)
- WebSocket for real-time session updates
- Session-based auth with Redis store

**Role Hierarchy:**
- `super_admin` → System-wide access, tenant management
- `admin_agent` → Tenant admin, can manage agents
- `agent` → Limited to chat workspace and history

**Key Patterns:**
- ProtectedRoute component enforces RBAC
- Zustand store (`useAuthStore`) for auth state
- Demo mode bypasses API with mock data
- Baileys sessions stored in Redis with encrypted tokens

## Commands

### Root Level
```bash
npm run doctor        # Lint + type check
npm run doctor:fix    # Auto-fix lint/format issues
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

## Environment Setup

**Backend `.env` (required):**
```
SESSION_SECRET=<random_string>
ENCRYPTION_KEY=<64_char_hex>
REDIS_URL=redis://localhost:6379
```

**Frontend:** Set `VITE_API_URL` for production API endpoint.

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Router config, content protection |
| `frontend/src/store/useAuthStore.ts` | Auth state (Zustand) |
| `frontend/src/components/ProtectedRoute.tsx` | Role-based route guard |
| `backend/index.js` | Express server, WhatsApp session management |
| `backend/api_v1.js` | All API endpoints |
| `backend/redis-auth.js` | Baileys auth state in Redis |

## Deployment

- **Frontend:** Vercel (auto-deploy from main). Requires `vercel.json` for SPA rewrites.
- **Backend:** VPS/Easypanel with Redis. Run with `--expose-gc` for memory management.

## Demo Mode

Login page has demo credentials that bypass real API:
- Admin Agent: `admin@tokomaju.com`
- User Agents: `siti@tokomaju.com`, `budi@tokomaju.com`, `dewi@tokomaju.com`
- Super Admin: `admin@localhost` (subtle link)

Demo uses role `agent` for user agents, `admin_agent` for admin.

## Agent Slot Limits

Both demo and production enforce **4 agent slots** per tenant (1 admin + 3 user agents).
