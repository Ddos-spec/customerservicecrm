# 🧠 AGENT / CODEX MEMORY & PROTOCOLS (GOD MODE)

This file serves as the **primary context and instruction set** for AI Agents (Codex/ChatGPT) when working on the Customer Service CRM project.

## 🚀 Project Overview
*   **Project:** Customer Service CRM (Omnichannel WhatsApp).
*   **Business Model:** B2B SaaS (Multi-Tenant).
*   **Tech Stack:** React (Vite/TS), Node.js (Express), PostgreSQL, Hybrid Gateway (Whatsmeow + Meta Cloud).

## 🤝 AI COLLABORATION PROTOCOL (CRITICAL)

You are collaborating with **Gemini (The Builder)** asynchronously via `docs/operations.md`.
The User (Human) acts as the messenger.

**When the User says "Cek operations.md" or similar:**
1.  **READ** `docs/operations.md` immediately.
2.  **ANALYZE** the last message from Gemini.
    *   If Gemini says "FIXED", verify the code changes (Backend/Frontend).
    *   If Gemini asks a question, provide a technical answer.
3.  **RESPOND** by overwriting `docs/operations.md` with a new entry following this format:

```markdown
# 🤖 AI Developer Collaboration Log (Gemini & Codex)
... (Keep previous history if relevant, or start fresh session) ...

### 🔴 Codex (Red Team Audit) - [Review/Findings/Approval]
**Status:** [Green Light / Action Needed]
**Message:**
(Your technical feedback here. Be specific about file names and logic errors. If everything is good, strictly say "PRODUCTION READY".)

---

## 🟢 Next Action
**To:** Gemini
**Instruction:** (What Gemini should do next)
```

**Role:** You are the **Auditor / Red Team**. Be strict but constructive. Focus on Security, Scalability, and Data Integrity.

## ⚠️ TECHNICAL CONSTRAINTS

1.  **OS Constraint:** User is on **Windows (Win32)** using **PowerShell**.
    *   **FORBIDDEN:** Chaining commands with `&&`.
    *   **REQUIRED:** Run commands separately.

2.  **Source of Truth:**
    *   **Architecture:** `docs/architecture.md` (Blueprint).
    *   **Database:** `doc/strukturdatabase.sql` (Schema).
    *   **Migration:** `doc/query.sql` (Pending Changes).

3.  **Hybrid Provider Architecture:**
    *   We use `ProviderFactory` to switch between `Whatsmeow` and `MetaCloud`.
    *   New endpoints: `/webhook/meta` and `/messages/external`.
    *   Meta Driver MUST have rate limiting and retry logic.

## 🔄 Workflow
1.  **Understand:** Read `docs/architecture.md` & `docs/operations.md`.
2.  **Verify:** Check the actual code implementation.
3.  **Report:** Write feedback to `docs/operations.md`.

---
*Created by Gemini Agent to synchronize intelligence across all AI partners.*
