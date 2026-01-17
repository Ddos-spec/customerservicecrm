# 🧠 AGENT / CODEX MEMORY & PROTOCOLS (GOD MODE)

This file serves as the **primary context and instruction set** for AI Agents (Codex/ChatGPT) when working on the Customer Service CRM project.

## 🚀 Project Overview
*   **Project:** Customer Service CRM (Omnichannel WhatsApp).
*   **Business Model:** B2B SaaS (Multi-Tenant).
*   **Tech Stack:** React (Vite/TS), Node.js (Express), PostgreSQL, Go (Whatsmeow Gateway).

## ⚠️ CRITICAL OPERATIONAL RULES (DO NOT IGNORE)

1.  **OS Constraint:** User is on **Windows (Win32)** using **PowerShell**.
    *   **FORBIDDEN:** Chaining commands with `&&` (e.g., `git add . && git commit`).
    *   **REQUIRED:** Run commands separately or use `;`.

2.  **Source of Truth:**
    *   **Architecture:** Read `docs/architecture.md` BEFORE changing any logic.
    *   **Database:** Read `doc/strukturdatabase.sql` for schema references.
    *   **Migration:** Write new SQL changes to `doc/query.sql`.

3.  **Code Quality:**
    *   **Linting:** Use `npm run lint` to check for errors.
    *   **Quotes:** Enforce SINGLE QUOTES `'` in JavaScript/TypeScript.
    *   **Testing:** Run `npm test` in `backend/` when touching API logic.

## 🏛️ System Architecture (Latest State)

### 1. Single Session Model (SaaS)
*   **Concept:** 1 Tenant = 1 WhatsApp Number (Session).
*   **Logic:** Users (Agents) do not have personal sessions. They use the Tenant's session.
*   **DB:** `tenants.session_id` is the master key. `users.session_id` columns are deprecated/removed.

### 2. Super Admin Powers
*   **Impersonate:** Admin can "Login As" any Tenant Owner to debug.
*   **API Key:** Tenants have `api_key` for external integrations.
*   **Alerts:** System sends WhatsApp alerts to Super Admin phone (no external webhooks).

### 3. Future Roadmap (Hybrid Provider)
*   We are moving towards supporting **Official Meta Cloud API**.
*   Database columns (`wa_provider`, `meta_token`) are already prepared in `doc/strukturdatabase.sql`.
*   Check `docs/architecture.md` -> "Hybrid Provider Roadmap" for implementation steps.

## 🔄 Workflow
1.  **Understand:** Read `docs/architecture.md`.
2.  **Plan:** Propose changes based on the roadmap.
3.  **Execute:** Modify code -> Lint -> Test.
4.  **Verify:** Ensure no regression in Login/Session flow.

---
*Created by Gemini Agent to synchronize intelligence across all AI partners.*
