# Desain — Panel Admin dengan Material UI dan Mode Gelap

- **Versi:** 1.0
- **Tanggal:** 8 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** seluruh tampilan panel admin (`src/app/(admin)/**`, `src/components/admin/**`). Server, aksi, hak akses, dan situs publik tidak berubah.

## 1. Latar belakang & tujuan

Panel admin dibangun dengan shadcn/ui (Radix) dan Tailwind. Pemilik ingin panel admin memakai **Material UI (MUI)** agar:
- tampilannya khas Material (kartu, bayangan, tipografi, tombol bergaya Google) dengan warna SunDY;
- ada komponen siap pakai yang belum dimiliki: tabel data dengan urut/saring/halaman, pemilih tanggal, grafik, dan pencarian dengan saran;
- pengembangan ke depan lebih seragam dengan satu pustaka komponen yang dikenal luas;
- tersedia **mode gelap**.

**Berhasil bila:**
- semua 26 halaman admin dan halaman masuk tampil dengan MUI dan tema SunDY, di desktop dan ponsel, dalam mode terang dan gelap;
- semua alur yang ada tetap berjalan sama (uji integrasi, komponen, dan E2E lulus);
- situs publik, kuis `/daftar`, struk, dan formulir food recall pasien tidak berubah rupa;
- build produksi tetap lolos di server 2 GB.

## 2. Keputusan (dikonfirmasi pemilik, 8 Okt 2026)

| # | Keputusan | Pilihan |
|---|---|---|
| MU1 | Tujuan | Tampilan Material, komponen siap pakai, konsistensi pengembangan |
| MU2 | Cakupan | **Seluruh admin sekaligus** dalam satu proyek; situs publik tetap |
| MU3 | Komponen MUI X | DataGrid, Date Pickers, Charts; Autocomplete (MUI inti) |
| MU4 | Pendekatan | MUI dipakai **langsung** di setiap berkas admin (bukan membungkus ulang `@/components/ui`); tata letak dengan `Box`/`Stack`/`Grid` dan `sx` |
| MU5 | Mode gelap | Tombol **Terang / Gelap / Ikuti sistem** di bilah atas, bawaan ikuti sistem, disimpan **per perangkat**; admin saja |

## 3. Fondasi

### 3.1 Paket
`@mui/material`, `@mui/material-nextjs`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `@mui/x-data-grid`, `@mui/x-date-pickers`, `@mui/x-charts`, `dayjs` (locale `id`). Versi stabil terbaru yang mendukung React 19 dan Next.js 15 (saat desain: MUI 9.4, MUI X 9.15). Ini pengecualian sadar dari aturan "tanpa dependensi baru".

### 3.2 Penyekatan dari situs publik
- Layout baru `src/app/(admin)/layout.tsx` (meliputi `/admin/**` dan `/masuk`) memasang `AppRouterCacheProvider` (lapisan CSS aktif), `ThemeProvider` dengan tema SunDY, `CssBaseline`, `LocalizationProvider` (dayjs, `id`), dan `InitColorSchemeScript`.
- Situs publik (`(public)`) tidak memuat provider MUI dan tetap shadcn + Tailwind.
- Urutan lapisan CSS di `globals.css` diatur (`@layer theme, base, mui, components, utilities`) agar reset Tailwind tidak merusak MUI dan kelas MUI tidak ditimpa sembarangan.
- `src/components/ui/*` tetap ada untuk situs publik; panel admin tidak lagi mengimpornya.

### 3.3 Tema SunDY
- **Terang:** utama emas (`gold-500`), sekunder cokelat (`brown-900`), latar krem; galat, peringatan, sukses dari palet yang sudah ada.
- **Gelap:** latar cokelat sangat tua, permukaan kartu sedikit lebih terang, teks krem, emas dicerahkan agar kontras teks dan tombol memenuhi WCAG AA (4,5:1 untuk teks biasa).
- Huruf badan Plus Jakarta Sans, judul Cormorant (font yang sudah dimuat `next/font`).
- Sudut 12px, kartu berbayangan lembut, tombol tanpa huruf kapital semua, ukuran kontrol "small" di tabel dan formulir padat.
- Variabel CSS MUI (`cssVariables: true`, `colorSchemes: { light, dark }`) sehingga pergantian skema tidak me-render ulang dari nol dan tanpa kedip.

### 3.4 Ikon
Material Icons (`@mui/icons-material`) di admin; `lucide-react` tetap untuk situs publik.

## 4. Pemetaan komponen

Prinsip: **nama yang dilihat pengguna tidak berubah** (label kolom, nama tombol, judul dialog, teks pesan), supaya kebiasaan staf dan uji yang mencari lewat label tetap berlaku.

| Sekarang | Menjadi | Catatan |
|---|---|---|
| Sidebar, header | `Drawer` (tetap di desktop, geser di ponsel) + `AppBar`/`Toolbar` | lencana angka menu memakai `Badge`; tombol mode dan menu pengguna di `AppBar` |
| `PageHeader`, `SectionCard`, `StatTile`, `EmptyState` | `Typography`, `Card`/`CardHeader`/`CardContent`, `Card` + `CardActionArea` tautan, `Typography` | |
| `PageTabs` | `Tabs` + `Tab` tautan | alamat `?tab=`/`?lihat=` tetap |
| `Button`, status `Badge` | `Button`/`IconButton`, `Chip` | warna status dari tema |
| `Input` + `Label` | `TextField` garis tepi kecil | label tetap terhubung ke kolom |
| `RupiahInput` | `TextField` dengan awalan "Rp" | format ribuan dan nilai angka tetap |
| `<select>` | `TextField select` **native** | tetap `<select>` asli |
| Isian tanggal dan bulan | MUI X `DatePicker` (tampilan tahun/bulan untuk isian bulan) | nilai dipertukarkan tetap sebagai `"YYYY-MM-DD"` / `"YYYY-MM"` |
| Pemilih pasien (booking, penjualan langsung, cocokkan pasien) | `Autocomplete` asinkron ke pencarian pasien yang ada | "+ Pasien Baru" tetap |
| Pilih barang (barang masuk, tambah barang tagihan, tambah obat resep) | `Autocomplete` berisi kode, nama, dan sisa stok | barang tanpa stok tetap tidak bisa dipilih |
| Daftar besar: Pasien, Booking, Tagihan, Perlu ditagih, Stok barang, Faktur masuk, Hutang, Supplier, Resep, Pengeluaran, Templat berulang, Staf | MUI X `DataGrid` | urut, saring kolom, halaman 25 baris, di sisi klien atas baris yang sudah disaring server; virtualisasi dimatikan; keadaan kosong memakai teks yang sama |
| Tabel kecil dan tabel berisi isian (baris tagihan, pembayaran, rincian laporan, daftar obat, treatment kunjungan, jadwal) | `Table` MUI | |
| `Dialog`, `AlertDialog` | `Dialog`; konfirmasi berbahaya (finalisasi, batalkan) tetap berperan `alertdialog` | judul dialog tetap jadi nama aksesibelnya |
| Grafik tren Laporan (SVG) | MUI X Charts (batang pendapatan/biaya, garis laba) dengan tooltip | tabel data tersembunyi tetap ada |
| Kartu Angka di dasbor | tambah grafik batang kecil booking per sumber | data yang sudah ada |
| Pop-up `sonner` | tetap `sonner`, gaya mengikuti tema dan skema | perilaku pemberitahuan langsung tidak berubah |
| Halaman cetak (tagihan, etiket) | MUI | selalu dicetak terang |
| Formulir kunjungan dokter | `TextField`, `Card`, `Table` | autosave, versi, finalisasi, dan tab tidak berubah |

**Tidak berubah:** situs publik, kuis `/daftar`, struk booking, formulir food recall pasien, semua aksi server, pembacaan data, hak akses, dan aturan murni di `src/lib`.

## 5. Mode gelap

- Tombol di `AppBar` dengan tiga pilihan **Terang / Gelap / Ikuti sistem** (bawaan ikuti sistem), memakai `useColorScheme` MUI; pilihan disimpan di peramban (per perangkat), tanpa perubahan basis data.
- `InitColorSchemeScript` di layout admin mencegah kedip terang sebelum gelap saat halaman dibuka.
- Semua komponen (termasuk DataGrid, Date Pickers, Charts, dialog, sonner) dan komponen buatan sendiri (grafik, warna status lunas/terlambat/menipis/kedaluwarsa) diperiksa kontrasnya di kedua skema.
- Halaman cetak selalu terang (`@media print`).
- Situs publik tetap terang walau atribut skema tertinggal di `<html>` setelah berpindah dari admin (situs publik tidak memakai variabel MUI).

## 6. Pengujian

- **Komponen (Vitest + Testing Library):** 58 berkas uji admin disesuaikan bila cara pencarian elemen berubah (mis. pilihan barang kini Autocomplete). Uji baru: konversi tanggal Date Picker ↔ teks, Autocomplete pasien dan barang (saran, pilih, kosong, galat jaringan), pembungkus DataGrid (baris tampil, urut, keadaan kosong), tombol mode (pilihan tersimpan dan dipulihkan), dan tema (token warna kedua skema).
- **Integrasi:** tidak berubah; harus tetap lulus (kecuali 3 uji lama `schedule.test.ts` yang sudah gagal sebelumnya).
- **Arsitektur:** aturan yang ada tetap (halaman tidak mengimpor `@/lib/db`; komponen server hanya mengambil komponen dari modul `"use client"`); ditambah aturan bahwa berkas admin tidak mengimpor `@/components/ui/*`.
- **E2E (Playwright):** ke-20 spek di desktop dan ponsel. Pembantu baru `isiTanggal(halaman, label, "YYYY-MM-DD")` dan `pilihOpsi(halaman, label, teks)`. Satu spek baru untuk mode gelap (tombol mengubah skema, bertahan setelah muat ulang, cetak tetap terang). Spek situs publik memastikan rupa publik tidak berubah.
- **Tinjauan visual:** foto setiap halaman admin (desktop dan ponsel, terang dan gelap) dikumpulkan dalam satu halaman pratinjau privat untuk pemilik sebelum merge.
- **Ukuran:** ukuran JavaScript halaman admin dari keluaran `next build` dicatat sebelum dan sesudah.

## 7. Peluncuran

- Spec → rencana → eksekusi di branch `desain-mui` → review akhir → PR → deploy dengan backup basis data.
- Tanpa migrasi basis data; kembali ke versi sebelumnya cukup dengan deploy ulang commit lama.
- Build di server memakai `NODE_OPTIONS=--max-old-space-size=1536`; bila tidak cukup, batasnya dinaikkan dan dilaporkan.

## 8. Risiko

| Risiko | Penanganan |
|---|---|
| Perubahan sangat besar (±110 berkas) → regresi | Seluruh suite, E2E dua ukuran layar, foto setiap halaman, review akhir |
| Bentrok gaya Tailwind dan MUI | Lapisan CSS, provider hanya di admin, spek publik dijalankan ulang |
| Date Picker di ponsel berbeda dari isian tanggal biasa | Diuji di proyek ponsel |
| DataGrid lebih berat di komputer lambat | Halaman 25 baris, virtualisasi mati |
| Ukuran bundel admin membesar | Diukur dan dilaporkan; pemisahan kode per halaman oleh Next.js |
| Kontras mode gelap kurang | Pemeriksaan kontras token dan tinjauan visual |

## 9. Di luar cakupan

Desain ulang situs publik; mode gelap situs publik; fitur berbayar MUI X Pro (rentang tanggal, DataGrid sisi server, pengelompokan baris); perubahan alur, hak akses, atau aksi server; minor dari review sebelumnya; pilihan mode per akun.

## 10. Hal yang diuji pemilik sebelum rilis

- Rupa tiap halaman di halaman pratinjau (terang dan gelap, desktop dan ponsel).
- Kenyamanan pemilih tanggal dan pencarian pasien/barang di ponsel meja depan.
