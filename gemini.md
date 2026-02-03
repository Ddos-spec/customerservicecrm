# 🤖 Gemini Agent Workflow Status & Memory

File ini digunakan oleh Agen Gemini untuk melacak progres pengembangan, tugas yang selesai, dan **protokol belajar mandiri (Self-Correction)** agar kesalahan tidak terulang.

**Project:** Customer Service CRM (Omnichannel WhatsApp)
**Arsitektur (Deployed):**
- **Frontend:** Vercel (React/Vite)
- **Backend:** VPS (Node.js/Express)
- **WA Gateway:** VPS (Go/Whatsmeow)

---

## 🧠 Self-Correction & Learning Protocols (CRITICAL)

**Instruksi untuk Diri Sendiri (Gemini) & Codex:**
1.  **Analisis Error:** Jika tool/command gagal, JANGAN langsung coba lagi dengan cara yang sama. Baca pesan error, pahami konteks environment (Windows/Linux), lalu perbaiki akarnya.
2.  **PowerShell Constraint:** Di environment Windows/PowerShell, DILARANG KERAS menggunakan operator chaining `&&`. Eksekusi command satu per satu menggunakan multiple tool calls.
3.  **Linting First:** Sebelum commit, jalankan `npm run lint` (jika ada) atau periksa aturan syntax (kutip satu vs dua). Jangan biarkan CI gagal karena hal sepele.
4.  **Update Memory:** Setiap kali menemukan pola error baru atau arsitektur berubah, update file ini (`GEMINI.md` atau `docs/architecture.md`) agar "ingatan" kita tersinkronisasi.
5.  **Test Robustness:** Saat membuat E2E test, pastikan database dibersihkan (`TRUNCATE/DELETE`) di awal (`beforeAll`) dan mock data valid (misal: URL harus diawali `http://`).
6.  **Secret Management:** Jangan pernah hardcode secret sebagai fallback (misal: `process.env.SECRET || 'unsafe_default'`). Biarkan undefined atau throw error. Husky akan memblokir commit jika ada unsafe secret.

---

## 📋 Roadmap & Progress

### 1. Refactoring & Cleanup (✅ Selesai)
- [x] Restrukturisasi Folder (Frontend/Backend/Gateway).
- [x] Dokumen dipindahkan ke `docs/`.
- [x] Pembersihan kode legacy.

### 2. Frontend Security & Demo Prep (✅ Selesai)
- [x] Hardened Mode (No Right Click, Inspect).
- [x] Environment Config.

### 3. API Integration (✅ Selesai)
- [x] Dashboard Integrations (Sessions, Logs).
- [x] Real-time QR Code.

### 4. Quality Assurance & Security (✅ Selesai)
- [x] Secret Scanner (Husky).
- [x] System Doctor.
- [x] Zero Errors/Warnings Policy.

### 5. Database & Features (✅ Selesai)
- [x] Chat History Storage.
- [x] Real-time Chat Sync.
- [x] Webhook Handler.

### 6. SaaS Architecture Migration (✅ Selesai - MAJOR)
- [x] **Single Session Architecture:** Menghapus `user_session_id`. 1 Tenant = 1 WA Session.
- [x] **Tenant API Key:** Tenant memiliki API Key sendiri untuk integrasi eksternal.
- [x] **Impersonate:** Super Admin bisa login sebagai Owner Tenant untuk debugging.
- [x] **Internal Alerting:** Notifikasi disconnect dikirim via WA ke Super Admin.
- [x] **Database Migration:** Script `doc/query.sql` diperbarui untuk V2, V3, & V4 schema.

### 7. DevOps & Automation (✅ Selesai)
- [x] **CI/CD Pipeline:** GitHub Actions untuk Backend Test & Frontend Build check.
- [x] **E2E Testing:** Script `backend/tests/saas_flow.test.js` (Fixed Redis Client issue).

### 9. Tenant Webhook Controls (✅ Selesai)
- [x] **Rate Limit Removal:** Menghapus rate limiter untuk integrasi n8n yang lebih lancar.
- [x] **Webhook Event Filtering:** Menambahkan kontrol event webhook per tenant (Groups, Private, Self).
- [x] **DB Schema Update:** Kolom `webhook_events` (JSONB) di tabel `tenants`.
- [x] **UI Integration:** Checkbox konfigurasi di menu "Atur Session WA".

### 10. Next Steps (Planned)
- [ ] **24H Window Logic (Official API).**
- [ ] **Broadcast/Campaign Feature.**


---

## 📝 Catatan Teknis (Knowledge Base)

- **Redis in Tests:** Saat testing backend yang pakai Redis, pastikan untuk `connect()` manual di `beforeAll` dan `quit()` di `afterAll`.
- **Hybrid Routing:** Pengiriman pesan sekarang melalui `ProviderFactory`. `WhatsmeowDriver` masih menggunakan legacy queue (`scheduleMessageSend`), sedangkan `MetaCloudDriver` langsung hit API.
- **Webhook Meta:** Verifikasi webhook Meta menggunakan `process.env.META_VERIFY_TOKEN`.
