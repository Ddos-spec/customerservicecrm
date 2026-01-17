# 🧠 CLAUDE AGENT MEMORY & PROTOCOLS (GOD MODE)

This file serves as the **primary context and instruction set** for Claude when working on the Customer Service CRM project.

## 🚀 Project Overview: SaaS CRM Omnichannel (WhatsApp)
*   **Type:** B2B SaaS Platform (Multi-Tenant).
*   **Stack:** 
    *   **Frontend:** React (Vite, TypeScript, Tailwind).
    *   **Backend:** Node.js (Express).
    *   **Database:** PostgreSQL.
    *   **Gateway:** Go (Whatsmeow) - Unofficial API.
*   **Current State:** Ready for Early Access (Closed Beta).

## 🏛️ Architecture & Source of Truth
**CRITICAL:** Before writing any code, ALWAYS check **`docs/architecture.md`**.
*   That file contains the Roadmap, Data Structure, and Logic Flow.
*   **Do not hallucinate** features. Implement exactly what is in the roadmap (currently Phase 5 DONE, Phase 6 Planned).

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
    *   If a test fails, fix the *test logic* or the *code logic*, don't just skip it.

## 🔐 Key Architectural Decisions (Current) 

1.  **Single Session Architecture:**
    *   1 Tenant = 1 WhatsApp Session.
    *   Users (Agents) do NOT have their own sessions. They inherit `tenants.session_id`.
    *   Column `users.session_id` is REMOVED.

2.  **Impersonation:**
    *   Super Admin can login as any Tenant Owner.
    *   Frontend shows a "Banner" when impersonating.

3.  **Internal Alerting:**
    *   No external webhooks for system alerts.
    *   Backend sends WhatsApp messages to Super Admin's number using `notifier_session_id`.

4.  **Hybrid Provider (Future):**
    *   We are preparing to support Meta Cloud API (Official) alongside Whatsmeow.
    *   Follow `docs/architecture.md` Phase 6 for implementation details.

## 🛠️ Common Commands
*   **Backend Test:** `cd backend; npm test` (Requires DB `customerservice_test`)
*   **Frontend Build:** `cd frontend; npm run build`
*   **Doctor:** `npm run doctor` (System health check)

---
*Updated by Gemini Agent to synchronize intelligence across all AI partners.*