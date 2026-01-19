# Customer Service CRM Architecture

## Scope
This document describes the current system architecture and role flows
for super admin, owner (tenant), and staff. It serves as the **Single Source of Truth** for development.

**Instruction for AI Agents:** When asked to implement a phase, read the specific details in the "Hybrid Provider Roadmap" section below and execute exactly as described.

## Components
- Frontend (React/Vite/TS/Tailwind): UI for login, workspace, and owner panels.
- Backend (Node/Express): auth, chats, contacts, messages, groups, sessions, webhook.
- WA Gateway (Go + WhatsMeow): handles WhatsApp login/connection and emits webhooks.
- Postgres: app data (tenants, users, contacts, chats, messages, **campaigns, contact_groups**) + whatsmeow_* tables.
- Redis: express-session store and WA cache/locks.
- WebSocket: pushes session updates to UI in real time.

## Phase tracker
- Phase 1 (Session reliability): done.
- Phase 2 (Multi-gateway routing + tenant assignment): done.
- Phase 3 (Scale hardening + observability): done.
- Phase 4 (Launch readiness): done.
- Phase 5 (SaaS Migration - Single Session & Impersonate): **DONE**.
- **Phase 6 (Hybrid Provider - Meta Cloud API):** **DONE**
  - Step 1: Database Schema (DONE)
  - Step 2: Adapter Layer (DONE)
  - Step 3: Incoming Webhook (DONE)
  - Step 4: UI Configuration (DONE)
  - Step 5: 24H Window Logic (NEXT - Moved to Marketing Module Phase 2 for Official API messages)
- **Phase 7 (Marketing Module - WA Blast):** **DONE**
  - Step 1: Database Schema (DONE)
  - Step 2: Core Backend Logic (DONE) - Campaigns, Contact Groups, Background Processor with Rate Limiting, Cancel/Delete Campaign.
  - Step 3: Frontend UI Integration (DONE) - Campaign List, Create Campaign, Contact Groups, Cancel/Delete Campaign.

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
- **Configure Provider**: Switch between Unofficial (QR) and Official (Meta API).
- **Marketing Module**: Create and manage WA Blast campaigns.

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

---

## Data tables (high level)
- tenants: id, company_name, status, session_id, gateway_url, **api_key**, **wa_provider**, **meta_phone_id**, **meta_waba_id**, **meta_token**.
- users: id, role, tenant_id, phone_number (no session columns).
- user_invites: ..., **last_error**.
- contacts: tenant_id, jid, full_name, phone_number.
- chats: tenant_id, contact_id, assigned_to, updated_at.
- messages: chat_id, sender, content, timestamps.
- **contact_groups**: id, tenant_id, name, description, **updated_at**.
- **contact_group_members**: contact_id, group_id.
- **campaigns**: id, tenant_id, name, message_template, status, scheduled_at, total_targets, success_count, failed_count, **updated_at**.
- **campaign_messages**: id, campaign_id, contact_id, phone_number, status, sent_at, wa_message_id, **updated_at**.
- whatsmeow_*: raw WhatsApp data from gateway.

---

## Hybrid Provider Roadmap (Actionable Blueprint)

Objective: Support Official WhatsApp Business API alongside Whatsmeow (Unofficial) using Adapter Pattern.

### Phase 1: Database Schema (DONE)
- Added columns to `tenants`: `wa_provider`, `meta_phone_id`, `meta_waba_id`, `meta_token`.

### Phase 2: Adapter Layer Implementation (DONE)
**Goal:** Decouple `backend/wa-gateway-client.js` from business logic.

1.  **Create Interface:**
    - File: `backend/services/whatsapp/provider.js`
    - Class `WhatsAppProvider` with methods:
        - `sendMessage(to, content, options)`
        - `getProfilePicture(jid)`
        - `checkNumber(phone)`

2.  **Create Drivers:**
    - File: `backend/services/whatsapp/drivers/whatsmeow.js`
        - Move logic from `wa-gateway-client.js` here.
        - Implements `WhatsAppProvider`.
    - File: `backend/services/whatsapp/drivers/meta.js`
        - Implements `WhatsAppProvider` using Axios to Graph API.
        - Endpoint: `https://graph.facebook.com/v18.0/{phone_id}/messages`

3.  **Factory Pattern:**
    - File: `backend/services/whatsapp/factory.js`
    - Function: `getProvider(tenant)`
    - Logic:
      ```js
      if (tenant.wa_provider === 'meta') return new MetaDriver(tenant);
      return new WhatsmeowDriver(tenant.session_id);
      ```

4.  **Refactor Routes:**
    - Update `backend/routes/messages.js` and `chat.js` to use `getProvider(tenant)` instead of direct `waGateway` calls.

### Phase 3: Incoming Webhook (Meta) (DONE)
**Goal:** Handle incoming messages from Meta Cloud API.

1.  **New Endpoint:**
    - File: `backend/routes/webhook-meta.js`
    - POST `/api/v1/webhook/meta`
    - GET `/api/v1/webhook/meta` (for Verification Challenge)

2.  **Transformer Logic:**
    - Create `backend/services/whatsapp/transformer.js`.
    - Convert Meta Payload -> Standard Message Object.
    - Meta Format: `entry[0].changes[0].value.messages[0]`
    - Standard Format: `{ from: '6281..', body: 'Hello', type: 'text', timestamp: ... }`

3.  **Storage Logic:**
    - Reuse existing `db.logMessage` function.
    - Ensure `contacts` are created/updated based on Meta payload.

### Phase 4: UI Configuration (DONE)
**Goal:** Allow users to switch providers in Dashboard.

1.  **Tenant Settings Page:**
    - Add "Connection Type" Dropdown: [Unofficial (QR)] vs [Official (Meta API)].
    - If Official selected, show Form:
        - Phone Number ID
        - WABA ID
        - Permanent Token
    - Save to DB.

### Phase 5: 24H Window Logic (NEXT - Moved to Marketing Module Phase 2 for Official API messages)
**Goal:** Enforce Meta's messaging window policy.

1.  **Backend Check:**
    - Before sending message, check last customer message timestamp.
    - If > 24 hours AND provider is Meta -> Throw Error "Window Closed".

2.  **Frontend UI:**
    - If Window Closed -> Disable Text Input.
    - Show "Send Template" button.
    - (Future) Template Manager UI.

---

## Marketing Module Roadmap (Actionable Blueprint)

Objective: Implement a comprehensive WA Blast and Campaign management system.

### Phase 1: Database Schema (DONE)
-   Added tables: `contact_groups`, `contact_group_members`, `campaigns`, `campaign_messages`.
-   **Note:** Ensure `updated_at` column is present in `contact_groups`, `campaigns`, `campaign_messages` tables for consistency and trigger functionality.

### Phase 2: Core Backend Logic (DONE)
-   **Routes:**
    -   `POST /marketing/groups`: Create contact group.
    -   `GET /marketing/groups`: List contact groups.
    -   `POST /marketing/groups/:groupId/members`: Add contacts to a group.
    -   `POST /marketing/campaigns`: Create a new campaign, populate `campaign_messages` queue.
    -   `GET /marketing/campaigns`: List campaigns.
    -   `POST /marketing/campaigns/:id/cancel`: Pause an active/scheduled campaign.
    -   `DELETE /marketing/campaigns/:id`: Delete a campaign (if not `processing` or `scheduled`).
-   **Campaign Processor:**
    -   Background worker (`marketing/processor.js`) running every 60s.
    -   Processes `campaign_messages` with status `pending` and `scheduled_at <= NOW()`.
    -   **Rate Limiting:** Hard-coded limit (50 msg/min/tenant).
    -   Uses `ProviderFactory` for sending.
    -   Updates `campaign_messages` and `campaigns` stats.

### Phase 3: Frontend UI Integration (DONE)
-   **Navigation:** Added "Marketing" to sidebar for `admin_agent`.
-   **CampaignList.tsx:** Displays list of campaigns with status, progress, and actions (Pause, Delete).
-   **CreateCampaign.tsx:** Form to create campaigns, select groups, set message.
-   **ContactGroups.tsx:** CRUD for contact groups, add members to groups.

---

## Notes and limits
- Ticketing is removed; chats are the primary unit.
- Setting tenant session_id will auto-assign a gateway when none is provided.
- Alerting for gateway down/over-capacity uses internal WhatsApp sender (not external webhook).
- Operations checklist is in `docs/operations.md`.
