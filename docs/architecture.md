# Customer Service CRM Architecture

## Scope
This document describes the current system architecture and role flows
for super admin, owner (tenant), and staff.

## Components
- Frontend (React/Vite/TS/Tailwind): UI for login, workspace, and owner panels.
- Backend (Node/Express): auth, chats, contacts, messages, groups, sessions, webhook.
- WA Gateway (Go + WhatsMeow): handles WhatsApp login/connection and emits webhooks.
- Postgres: app data (tenants, users, contacts, chats, messages) + whatsmeow_* tables.
- Redis: express-session store and WA cache/locks.
- WebSocket: pushes session updates to UI in real time.

## Phase tracker
- Phase 1 (Session reliability): done.
- Phase 2 (Multi-gateway routing + tenant assignment): done.
- Phase 3 (Scale hardening + observability): done.
- Phase 4 (Launch readiness): done.
- Phase 5 (SaaS Migration - Single Session & Impersonate): **DONE**.
- Phase 6 (Hybrid Provider - Meta Cloud API): **PLANNED**.

## Roles and capabilities
Super admin:
- Manage tenants (create, activate, set tenant session_id).
- Manage users across tenants.
- **Impersonate Tenant**: Login as any Tenant Owner for debugging.
- **Manage API Keys**: Generate/View Tenant API Keys.
- View global session status.

Owner (tenant):
- Manage staff in their tenant.
- Use workspace to monitor chats and send messages.
- View tenant contact count and chats.
- Access Tenant API Key for external integration.

Staff:
- Use workspace to reply to chats and send messages.
- No tenant management permissions.

## IDs and sessions
UI login session:
- Stored in Redis via express-session.
- Cookie holds session id.
- User data stored in req.session.user.

WA session (tenant):
- Identifier is session_id (phone number normalized to +62).
- Stored in `tenants.session_id`.
- **Single Session Architecture**: All users (Owner & Staff) inside the same tenant share the same WA session_id.
- `users.user_session_id` and `users.tenant_session_id` columns are REMOVED.
- Gateway token cached in memory and persisted in backend/storage/session_tokens.enc.

Notifier Session:
- System setting `notifier_session_id`.
- Used to send Internal Alerts (Gateway Disconnect, Over Capacity) to Super Admins via WhatsApp.

## Main flows
Login (UI):
1) Frontend POST /api/v1/admin/login.
2) Backend verifies user.
3) **Auto-Assign Session**: Backend sets `req.session.user.session_id` from `tenants.session_id`.
4) Cookie is issued to browser.

WA session setup (QR) for tenant:
1) Super admin assigns tenant session_id (tenant's WA number).
2) Backend calls gateway login and gets QR.
3) The tenant's device scans the QR (must be the same WA number).
4) Gateway sends webhook "connected".
5) Backend updates status and broadcasts to UI.

Internal Alerting (No Webhook):
- Events: Session Disconnected, Over Capacity.
- Action: Backend finds `notifier_session_id` (or active tenant session).
- Target: Sends WhatsApp message to all Users with role `super_admin` who have `phone_number`.

Tenant API Integration:
- Endpoint: `POST /api/v1/messages/external`
- Auth: Header `X-Tenant-Key`.
- Flow: Backend resolves Tenant by Key -> Gets Session ID -> Sends Message.

## Data tables (high level)
- tenants: id, company_name, status, session_id, gateway_url, **api_key**.
- users: id, role, tenant_id, phone_number (no session columns).
- user_invites: ..., **last_error**.
- contacts: tenant_id, jid, full_name, phone_number.
- chats: tenant_id, contact_id, assigned_to, updated_at.
- messages: chat_id, sender, content, timestamps.
- whatsmeow_*: raw WhatsApp data from gateway.

## Hybrid Provider Roadmap (Meta Cloud API)
Plan to support Official WhatsApp Business API alongside Whatsmeow (Unofficial).

1.  **Phase 1 (Database Schema):**
    - Add columns to `tenants`: `wa_provider` (enum: 'whatsmeow', 'meta'), `meta_phone_id`, `meta_waba_id`, `meta_token`.
2.  **Phase 2 (Adapter Layer):**
    - Abstract message sending logic into `backend/services/whatsapp`.
    - Create `WhatsmeowDriver` (legacy) and `MetaCloudDriver`.
3.  **Phase 3 (Incoming Webhook):**
    - New endpoint `POST /api/v1/webhook/meta`.
    - Transform Meta JSON payload -> Standard DB format -> Save to DB.
4.  **Phase 4 (UI Config):**
    - Frontend menu to input Meta Credentials.
5.  **Phase 5 (24H Window Logic):**
    - Implement Template Message handling for expired sessions.

## Notes and limits
- Ticketing is removed; chats are the primary unit.
- Setting tenant session_id will auto-assign a gateway when none is provided.
- Alerting for gateway down/over-capacity uses internal WhatsApp sender (not external webhook).
- Operations checklist is in `docs/operations.md`.
