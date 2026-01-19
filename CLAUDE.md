# 🧠 CLAUDE AGENT MEMORY & PROTOCOLS (GOD MODE)

This file serves as the **primary context and instruction set** for Claude when working on the Customer Service CRM project.

## 🚀 Project Overview: SaaS CRM Omnichannel (WhatsApp)
*   **Type:** B2B SaaS Platform (Multi-Tenant).
*   **Stack:** 
    *   **Frontend:** React (Vite, TypeScript, Tailwind).
    *   **Backend:** Node.js (Express).
    *   **Database:** PostgreSQL.
    *   **Gateway:** Hybrid (Whatsmeow Unofficial + Meta Cloud API Official).
*   **Current State:** Hybrid Provider Implemented (Phase 4 Done).

## 🏛️ Architecture & Source of Truth
**CRITICAL:** Before writing any code, ALWAYS check **`docs/architecture.md`**.
*   That file contains the Roadmap, Data Structure, and Logic Flow.
*   **Do not hallucinate** features. Implement exactly what is in the roadmap.

## ⚡ Core Rules (Non-Negotiable)

1.  **PowerShell Environment (Windows):**
    *   ❌ NEVER use `&&` chaining (e.g., `cd backend && npm start`).
    *   ✅ EXECUTE commands sequentially or use `;` (e.g., `cd backend; npm start`).
    *   ✅ Handle path separators correctly (`\` vs `/`).

2.  **Linting & Quality First:**
    *   ❌ NEVER commit code with linting errors.
    *   ✅ RUN `npm run lint` (in backend/frontend) before finishing a task.
    *   ✅ Use Single Quotes `'` for JS/TS strings (unless SQL query requires otherwise).

3.  **Database Migrations:**
    *   ❌ NEVER modify the database schema via ad-hoc queries blindly.
    *   ✅ WRITE migration scripts in `doc/query.sql`.
    *   ✅ UPDATE `doc/strukturdatabase.sql` to reflect the final state.

4.  **Self-Correction Protocol:**
    *   If a tool fails, **ANALYZE the error**. Do not blindly retry.
    *   If a test fails, check environment dependencies (Redis/DB).

## 🔐 Key Architectural Decisions (Current)

1.  **Single Session Architecture:**
    *   1 Tenant = 1 WhatsApp Session.
    *   Users (Agents) inherit `tenants.session_id`.

2.  **Hybrid Provider (Adapter Pattern):**
    *   We use `backend/services/whatsapp/factory.js` to switch between drivers.
    *   **Whatsmeow:** Uses local Go gateway & internal queue (`scheduleMessageSend`).
    *   **Meta:** Uses Direct Graph API call.
    *   **Routing:** `backend/routes/messages.js` handles the switch automatically.

3.  **Incoming Webhook:**
    *   `/api/v1/webhook` -> Whatsmeow (Legacy).
    *   `/api/v1/webhook/meta` -> Meta Cloud API (New).

4.  **Testing Strategy:**
    *   E2E Tests (`saas_flow.test.js`) run in GitHub Actions.
    *   Redis Client MUST be exported from `index.js` to allow tests to manage connection.

## 🛠️ Common Commands
*   **Backend Test:** `cd backend; npm test` (Requires DB `customerservice_test`)
*   **Frontend Build:** `cd frontend; npm run build`
*   **Doctor:** `npm run doctor` (System health check)

---
*Updated by Gemini Agent to synchronize intelligence across all AI partners.*
