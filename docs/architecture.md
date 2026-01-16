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
- Phase 3 (Scale hardening + observability): pending.
- Phase 4 (Launch readiness): pending.

## Roles and capabilities
Super admin:
- Manage tenants (create, activate, set tenant session_id).
- Manage users across tenants.
- Set notifier session id (optional WA number used for alerts).
- View global session status.

Owner (tenant):
- Manage staff in their tenant.
- Use workspace to monitor chats and send messages.
- View tenant contact count and chats.

Staff:
- Use workspace to reply to chats and send messages.
- No tenant management permissions.

End user (WhatsApp contact):
- External contact who chats via WhatsApp.

## IDs and sessions
UI login session:
- Stored in Redis via express-session.
- Cookie holds session id.
- User data stored in req.session.user.

WA session (tenant):
- Identifier is session_id (phone number normalized to +62).
- Stored in tenants.session_id.
- All users inside the same tenant share the same WA session_id.
- Gateway token cached in memory and persisted in backend/storage/session_tokens.enc.
- tenants.gateway_url (optional) overrides default WA_GATEWAY_URL for routing.

WA session (super admin notifier):
- Optional users.user_session_id for alerting/automation only.
- Not used to reconnect tenant numbers.

## Main flows
Login (UI):
1) Frontend POST /api/v1/admin/login.
2) Backend verifies user and sets req.session.user.
3) Cookie is issued to browser.

WA session setup (QR) for tenant:
1) Super admin assigns tenant session_id (tenant's WA number).
2) Backend calls gateway login and gets QR.
3) The tenant's device scans the QR (must be the same WA number).
4) Gateway sends webhook "connected".
5) Backend updates status and broadcasts to UI.

Session status:
- Source of truth is gateway webhook + refresh ping.
- Backend holds status in memory (sessions map) and persists to Redis.
- UI receives status via WebSocket.

Contacts sync:
- On connect or login, backend triggers syncContactsForTenant.
- Gateway returns contacts/groups and updates whatsmeow tables.
- Trigger sync_whatsmeow_to_crm_contact populates contacts table.

Chat and messages:
- contacts -> chats (1 chat per tenant + contact).
- messages belong to chats.
- Workspace loads chats and messages from backend.
- Sending message -> backend -> gateway -> WhatsApp.

Webhook and automation:
- Gateway posts events to /api/v1/webhook.
- n8n integration uses backend/n8n-api.js with tenant session_id.
- Notifier session id can be used by automation to send alerts.

## Data tables (high level)
- tenants: id, company_name, status, session_id, gateway_url, max_active_members.
- users: id, role, tenant_id, session_id fields.
- contacts: tenant_id, jid, full_name, phone_number.
- chats: tenant_id, contact_id, assigned_to, updated_at.
- messages: chat_id, sender, content, timestamps.
- whatsmeow_*: raw WhatsApp data from gateway.

## Notes and limits
- Ticketing is removed; chats are the primary unit.
- Multi-gateway routing uses tenants.gateway_url; empty uses default gateway.
- Session status is persisted in Redis and rehydrated on startup.

## Future (if needed)
- Per-gateway health checks and dashboards.
- Gateway capacity planning (per-gateway limits).
- Background workers for heavy sync.
