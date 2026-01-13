# Repository Guidelines

## Gaya Umum & Prinsip
- Gua/lu style, tapi tetap rapi. Pegang: **KISS** (bikin simple biar gampang debug), **YAGNI** (jangan nambah fitur sebelum perlu, biar gak numpuk utang), **DRY** (hindari copy-paste, ekstrak ke fungsi/komponen), **SOLID** + **SoC** (tanggung jawab tunggal, pisah UI/data/API). **Clean Code**: nama jelas, fungsi pendek, hindari side effect aneh.
- Efeknya: perubahan lebih cepat, risiko bug berkurang, review lebih mudah.

## Struktur Proyek
- Root: config, `scripts/` (doctor, scan-secrets), hooks di `.husky/`.
- `frontend/`: React + Vite + Tailwind (TS). Entry `src/main.tsx`, `src/App.tsx`; halaman di `src/pages/`, layout di `src/layouts/`, state di `src/store/`, komponen reusable di `src/components/`. Dark mode pakai kelas `dark` (`src/store/useThemeStore.ts`).
- `backend/`, `wa-gateway/`: service sisi server (cek README sebelum ubah).
- `docs/`: dokumentasi produk/API—update kalau behavior berubah.

## Perintah Dev/Build/Test
- Dev FE: `cd frontend && npm run dev` (Vite, port 5173).
- Build FE: `cd frontend && npm run build` (tsc -b + Vite prod).
- Cek lint/tipe FE: `cd frontend && npm run lint` atau `npm run check`.
- Root health check: `npm run doctor` / `npm run doctor:fix`.

## Style, Naming, & Kesalahan Umum
- Functional components + hooks; Tailwind untuk styling. Simpan konstanta/mock di level modul biar dependencies hooks bersih.
- Nama: PascalCase komponen, camelCase variabel/fungsi, SCREAMING_SNAKE_CASE konstanta.
- Hindari: logika berat di render, duplikasi util, mixing UI dan API di satu file, lupa toggle `dark` class di html/body.

## Testing
- Belum ada test formal; minimal jalankan `npm run check` sebelum commit.
- Kalau nambah logic penting, tambahin unit/integration test (kalau setup), atau tulis langkah verifikasi manual di PR.

## Commit & PR
- Commit singkat, imperatif: contoh “Fix dark mode config load”, “Address demo useMemo lint warnings”.
- Pastikan working tree bersih dan `npm run check` lulus; Husky jalanin `scripts/scan-secrets.js` dan `scripts/smart-check.js`.
- PR: jelasin perubahan, langkah reproduce & verifikasi, link issue, sertakan screenshot/GIF untuk UI (light & dark).

## Security & Config
- Jangan commit secrets; `.env` lokal saja. Secret scanner bakal teriak kalau ada bocor.
- Kalau ubah auth/session atau tema, cek `localStorage` key dan apply kelas `dark` saat load (`src/main.tsx`).
- Proxy/API target di `frontend/vite.config.ts` harus environment-driven; jangan hardcode prod URL. 
