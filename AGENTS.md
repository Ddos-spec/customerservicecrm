# Repository Guidelines

## Nada & Prinsip
- Gua/lu vibe tapi tetap profesional. KISS: pilih path paling simple biar debug cepat. YAGNI: stop bikin fitur/prop sebelum ada use case. DRY: copy dua kali? jadi util/hook/komponen. SOLID + SoC: satu file satu tanggung jawab, UI/state/API dipisah. Clean Code: nama jelas, fungsi pendek, hindari side effect. Efeknya: perubahan gesit, bug turun, review enteng.

## Struktur & Modul
- Root: `docker-compose.yaml` (Postgres, Redis, wa-gateway, backend), `scripts/` (doctor, scan-secrets, smart-check), hook di `.husky/`, setup dev di `.vscode/`, dokumentasi & skema di `docs/` + `strukturdatabase*.txt`.
- `backend/`: Node/Express dengan Postgres/Redis. Entry `index.js`, routes di `api_v1/` + `auth.js`. UUID untuk tenant/user/ticket, seat limit `tenants.max_active_members`, normalisasi nomor WA di alur auth/user/invite.
- `frontend/`: React + Vite + TS + Tailwind. Entry `src/main.tsx`/`App.tsx`; layout `src/layouts/`, halaman `src/pages/`, komponen `src/components/`, state `src/store/`, API helper `src/lib/api.ts`. Tema light/dark via kelas `dark` di html/body.
- `wa-gateway/`: Go WhatsApp gateway; cek README/Makefile sebelum build/deploy.

## Perintah Dev/Build/Test
- Root: `npm run doctor` / `npm run doctor:fix`.
- Backend: `cd backend && npm run dev`, `npm run start`, `npm run check`/`npm run lint`, `npm run test` (Jest). Pastikan env Postgres/Redis/wa-gateway ada.
- Frontend: `cd frontend && npm run dev` (5173), `npm run build`, `npm run check`/`npm run lint`, `npm run preview`.
- Kontainer: `docker-compose up -d redis postgres wa-gateway backend` (isi env dulu).

## Style, Naming, & Anti-Bloopers
- Indent: frontend 2 spasi, backend ikuti file (4 spasi). PascalCase komponen, camelCase variabel/fungsi, SCREAMING_SNAKE_CASE env.
- Jangan parseInt ID (UUID string). Pisah UI/API/state; jangan numpuk logika berat di render; hindari duplikasi util.
- Set kelas `dark` sebelum render (lihat `src/main.tsx`). Normalisasi nomor WA ke +62; hormati seat limit + pending invites saat bikin admin/agent.

## Testing
- Minimal: `npm run check` di frontend dan backend sebelum commit; `npm run test` backend kalau ubah logic API/auth.
- Manual: login + toggle light/dark, tambah tenant/admin/agent sampai limit, kirim undangan (cek webhook/n8n + email), alur tiket/pesan utama.

## Commit & PR
- Commit imperatif pendek, contoh: "Normalize phone on invite". Lulus lint/check dulu; Husky jalanin `scripts/scan-secrets.js` + `scripts/smart-check.js`.
- PR: tulis ringkas perubahan, langkah uji, env/migrasi yang kena, sertakan screenshot/GIF UI (light & dark), link issue/trello bila ada.

## Security & Config
- Secrets di `.env` lokal/server, jangan di-commit. Kunci: `SESSION_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`/`PG*`, `REDIS_URL`, `WA_GATEWAY_PASSWORD`, `AUTH_JWT_SECRET`, `FRONTEND_URL`, `N8N_INVITE_WEBHOOK_URL`. Butuh extension `pgcrypto` buat UUID. Hindari hardcode URL frontend/backend.
