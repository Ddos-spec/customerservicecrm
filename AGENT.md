# 🧠 AGENT / CODEX MEMORY & PROTOCOLS (GOD MODE)

This file serves as the **primary context and instruction set** for AI Agents (Codex/ChatGPT) when working on the Customer Service CRM project.

## 🚀 Project Overview
*   **Project:** Customer Service CRM (Omnichannel WhatsApp).
*   **Business Model:** B2B SaaS (Multi-Tenant).
*   **Tech Stack:** React (Vite/TS), Node.js (Express), PostgreSQL, Hybrid Gateway (Whatsmeow + Meta Cloud).

## ⚠️ CRITICAL OPERATIONAL RULES (DO NOT IGNORE)

1.  **OS Constraint:** User is on **Windows (Win32)** using **PowerShell**.
    *   **FORBIDDEN:** Chaining commands with `&&`.
    *   **REQUIRED:** Run commands separately.

2.  **Source of Truth:**
    *   **Architecture:** Read `docs/architecture.md` BEFORE changing any logic.
    *   **Database:** Read `doc/strukturdatabase.sql` for schema references.
    *   **Migration:** Write new SQL changes to `doc/query.sql`.

3.  **Code Quality:**
    *   **Linting:** Use `npm run lint`.
    *   **Security:** NEVER commit default secrets. Use `process.env`.
    *   **Testing:** Run `npm test` in `backend/` when touching API logic.

## 🏛️ System Architecture (Latest State)

### 1. Hybrid WhatsApp Provider
*   **Factory Pattern:** `ProviderFactory.getProvider(tenant)` determines the driver.
*   **Drivers:** `WhatsmeowDriver` (Legacy Queue) vs `MetaCloudDriver` (Direct).
*   **Configuration:** Stored in `tenants` table (`wa_provider`, `meta_token`, etc).

### 2. Single Session Model (SaaS)
*   **Concept:** 1 Tenant = 1 WhatsApp Number.
*   **DB:** `tenants.session_id` is the master key. `users.session_id` is removed.

### 3. Testing Protocols
*   Backend tests (`saas_flow.test.js`) require a running Redis instance.
*   `redisClient` is exported from `index.js` to allow tests to connect/quit manually.
*   Always use `TRUNCATE` or `DELETE` in `beforeAll` to ensure a clean state.

## 🔄 Workflow
1.  **Understand:** Read `docs/architecture.md`.
2.  **Plan:** Propose changes based on the roadmap.
3.  **Execute:** Modify code -> Lint -> Test.
4.  **Verify:** Ensure CI pipeline (GitHub Actions) passes.

---
*Created by Gemini Agent to synchronize intelligence across all AI partners.*