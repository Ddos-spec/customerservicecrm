# WACentral — Redesign & Route Audit

Tanggal audit: 20 Juli 2026

## Ringkasan

Redesign mengubah antarmuka lama menjadi satu product system bernama **WACentral**. Fokus perubahan adalah konsistensi lintas role, navigasi yang lengkap, landing page yang terhubung langsung ke aplikasi, responsive behavior, dark mode, dan motion yang tetap aksesibel.

Tidak ada kontrak API, struktur database, autentikasi, atau logic bisnis backend yang diubah. Dengan demikian patch dapat diterapkan tanpa migrasi database.

## Role dan cakupan route

| Role | Route utama | Halaman yang dicakup |
|---|---|---|
| Public | `/`, `/login`, `/invite/:token`, `/subscribe` | Landing, login, aktivasi undangan, langganan |
| Super Admin | `/super-admin/*` | Overview, Global Inbox, Tenant, Pengguna, Sesi Gateway, API Integrasi, Pengaturan |
| Owner | `/admin/*` | Overview, Inbox, Riwayat, Laporan, AI Agent, AI Assistant, Campaign, Grup Kontak, Tim Staff, Integrasi, Langganan |
| Staff | `/agent/*` | Overview, Inbox, Riwayat |

Route turunan campaign (`/admin/marketing/create` dan `/admin/marketing/:id`) tetap tersedia dari modul Campaign. Redirect legacy `/tickets/*` juga dipertahankan agar tautan lama tidak rusak.

## Temuan audit yang diselesaikan

1. Route `/` sebelumnya terpisah dari React app dan deployment memiliki dua pengalaman visual berbeda. Landing sekarang menjadi bagian dari routing utama.
2. Empat halaman Super Admin sudah ada tetapi tidak terlihat di navigasi: Pengguna, Sesi Gateway, dan Pengaturan. Semuanya sekarang dapat diakses dari sidebar.
3. Halaman Laporan Owner tersedia di router tetapi tidak muncul pada navigasi. Sekarang masuk ke grup Workspace.
4. Navigasi horizontal lama tidak scalable untuk Owner yang memiliki banyak modul. Diganti sidebar bertingkat dengan group label dan mobile drawer.
5. Naming lama tidak konsisten (`CRM SaaS`, `mycustomerservice`, dan `myaicustom.com`). Product UI disatukan menjadi WACentral, dengan `myaicustom.com` tetap sebagai parent brand.
6. Landing HTML lama dan app menggunakan dua design language. Entry `index.html` serta `app.html` sekarang memuat aplikasi yang sama.
7. Loading state generik diganti branded loading state pada route lazy-load dan validasi sesi.
8. Warna status bercampur dengan warna aksi. Sistem baru memakai violet untuk aksi/brand, acid untuk highlight, hijau untuk status sukses, amber untuk warning, dan merah untuk destructive state.
9. Animasi lama tidak memiliki fallback. Motion system sekarang menghormati `prefers-reduced-motion`.
10. Dashboard desktop dan mobile sebelumnya memakai struktur navigasi berbeda. Keduanya sekarang memakai satu source of truth per role.

## Design system

- Brand: ink black, electric violet, acid lime, warm off-white.
- Layout: sidebar 272 px, topbar 80 px, content max 1530 px.
- Surface: radius 24–30 px, low-noise border, soft elevation.
- Type hierarchy: compact operational labels, high-contrast headings, readable supporting copy.
- Motion: entrance reveal, floating metrics, ticker, orbit, hover elevation, command palette.
- Accessibility: keyboard command `Ctrl/Cmd + K`, `Escape` close behavior, semantic navigation, focus rings, reduced-motion support, responsive touch targets.

## Quality gate

- `npm run lint`: lulus tanpa error atau warning.
- `npm run build`: lulus; 1.804 module berhasil ditransformasi.
- TypeScript project build: lulus.
- Seluruh page module muncul sebagai production chunk, termasuk semua role.
- Backend contract: tidak berubah.
- Database migration: tidak diperlukan.

## Menjalankan patch

```bash
cd frontend
npm ci
npm run dev
```

Production check:

```bash
cd frontend
npm run lint
npm run build
```

