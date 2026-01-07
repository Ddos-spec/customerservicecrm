# Next Progress - CRM WhatsApp (Super Admin, Admin Agent, User Agent)

Dokumen ini berisi ringkasan progres saat ini, risiko, dan strategi mitigasi agar penggunaan WhatsApp via Baileys lebih aman (target 80% aman untuk operasional normal, non-spam). Gunakan ini sebagai pegangan untuk kelanjutan kerja dan onboarding AI berikutnya.

## Status saat ini (sudah berjalan)
- Super Admin:
  - Manajemen tenant sudah lengkap: tambah tenant, set session WA, status aktif/suspend.
  - Tambah tenant sekaligus membuat Admin Agent (email + password) dan session WA.
  - Multi webhook per-tenant, bisa tambah/hapus.
- Admin Agent:
  - Dashboard dan data real (stats, tickets).
  - Bisa scan QR untuk koneksi WA.
  - Bisa undang user agent via email.
- User Agent:
  - Tampilan sama seperti demo, tapi data real.
  - Tidak bisa scan QR, hanya bisa lihat status dan minta admin agent.
- Chat:
  - Kirim pesan sekarang benar-benar ke WA (endpoint internal), lalu log ke DB.
  - Jika WA offline atau nomor invalid, kirim gagal dan UI menampilkan error.
- Demo pages sudah dipindah ke folder terpisah agar tidak mengganggu real UI.

## Testing yang sudah dilakukan (hasil OK)
- Backend: `npm test -- --runInBand`
- Frontend: `npm run build`

## Risiko WhatsApp (Unofficial API)
Baileys adalah unofficial. Risiko suspend/ban tetap ada walau tidak spam. Tujuan kita adalah menurunkan risiko, bukan menghilangkan 100%.

Risiko utama:
- Peningkatan volume mendadak.
- Pesan seragam ke banyak nomor.
- Sering ganti device/QR (reconnect berulang).
- IP berubah-ubah atau lingkungan device tidak stabil.
- Endpoint publik bisa disalahgunakan jika token bocor.

## Strategi keamanan (teknis + operasional)
Target strategi ini agar pemakaian normal (1:1 support) tidak terlihat seperti spam.

### Operasional
1) Pastikan nomor WA sudah warm-up (aktivitas manual wajar dulu).
2) Hindari broadcast; gunakan 1:1 response berbasis tiket aktif.
3) Hindari template pesan berulang ke banyak nomor dalam waktu singkat.
4) Jangan sering reset QR/reauth; gunakan device dan IP stabil.
5) Saat koneksi putus, lakukan recovery manual via Admin Agent (bukan auto loop).

### Teknis (disarankan segera)
1) Guard server-side: hanya boleh kirim ke `customer_contact` yang ada di ticket tenant.
2) Window waktu: batasi kirim hanya jika ada pesan masuk dalam 24 jam terakhir.
3) Rate limit per tenant: contoh 30 msg/jam, dan hard cap harian.
4) Jitter dan delay per message (sudah ada, bisa diperketat).
5) Disable/batasi endpoint bulk `/api/v1/messages` di production.
6) Audit token sesi secara berkala, rotate token jika dicurigai.
7) Logging outbound dan reject reason (untuk forensik jika ada flag).

## Backlog prioritas untuk dilanjutkan
1) Implement server guard:
   - Validate nomor harus cocok dengan ticket aktif tenant.
   - Optional: hanya jika last customer message < 24 jam.
2) Rate limiter per tenant (middleware di endpoint kirim).
3) Disable/batasi `/api/v1/messages` di env production.
4) Tambah monitoring status WA (alert jika disconnected > X menit).
5) Audit keamanan token session dan akses API.

## Catatan integrasi WA saat ini
- Frontend kirim via `POST /api/v1/internal/messages`.
- Backend endpoint ini:
  - Cek session tenant aktif.
  - Validasi nomor WA.
  - Kirim via Baileys dengan delay typing.
  - Jika sukses -> frontend log ke DB lewat `/admin/tickets/:id/messages`.

## Saran uji aman (sebelum production)
1) Gunakan nomor pribadi untuk pilot dan jumlah chat kecil.
2) Coba skenario offline: putuskan sesi lalu kirim chat, pastikan gagal.
3) Coba nomor invalid: pastikan server menolak.
4) Pantau log WA: pastikan tidak terjadi reconnect loop.

## File penting untuk perubahan selanjutnya
- Backend:
  - `backend/api_v1.js` (endpoint internal kirim WA)
  - `backend/auth.js` (akses admin, invite)
  - `backend/db.js` (tenant/session/webhook/invite)
  - `backend/index.js` (health/ping/test friendly)
- Frontend:
  - `frontend/src/pages/AgentWorkspace.tsx` (send WA + log)
  - `frontend/src/pages/TenantManagement.tsx` (create tenant + admin agent + session)
  - `frontend/src/pages/AgentManagement.tsx` (invite flow)
  - `frontend/src/pages/demo/` (demo UI dipisah)

## Ringkas keputusan
- Fokus utama: keamanan dan kestabilan penggunaan Baileys.
- Prioritas: guard + rate limit + batasi endpoint bulk.
