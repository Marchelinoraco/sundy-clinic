# Resep terstruktur oleh dokter — desain

Tanggal: 13 Oktober 2026 · Status: menunggu tinjauan pemilik

Melanjutkan dan mengubah: `docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md` (penyerahan obat oleh
Apoteker, keputusan RS1).

## 1. Tujuan

Sekarang dokter hanya menulis "Catatan untuk Apoteker" (teks bebas), lalu Apoteker memilih obat, jumlah, dan aturan pakai.
Pemilik ingin dokter sendiri yang menulis resep terstruktur dari stok, dan resep itu langsung menjadi baris tagihan tanpa
langkah Apoteker di sistem.

Berhasil bila: dokter memilih obat dari stok cabang beserta jumlah dan aturan pakai di catatan kunjungan, melihat sisa stok
tanpa harga; saat catatan difinalkan, obat itu masuk tagihan kunjungan; resepsionis bisa mengurangi atau menghapus baris
resep dengan alasan yang tercatat dan terlihat dokter; resepsionis mencetak etiket dari tagihan; Apoteker tidak lagi
menerima antrean baru.

### Keputusan pemilik

| No | Keputusan |
|----|-----------|
| RD1 | Dokter menulis resep: obat dari stok, jumlah, dan aturan pakai. |
| RD2 | Resep langsung menjadi baris tagihan; tidak ada langkah Apoteker di sistem. |
| RD3 | Alur lama "Catatan untuk Apoteker" + antrean Apoteker diganti sepenuhnya untuk kunjungan baru. |
| RD4 | Stok kurang hanya peringatan bagi dokter; tagihan tertahan sampai stok cukup atau jumlah dikurangi. |
| RD5 | Resepsionis boleh mengurangi jumlah atau menghapus baris resep di draf tagihan, dengan alasan wajib. |
| RD6 | Etiket dicetak resepsionis dari tagihan. |
| RD7 | Resep disimpan di kunjungan lalu otomatis menjadi penyerahan Selesai (pendekatan 1: sambungan penyerahan → tagihan yang sudah ada dipakai ulang). |

## 2. Data

Migrasi hanya menambah.

### 2.1 `EncounterPrescription` (baru)

| Kolom | Keterangan |
|-------|------------|
| `id`, `encounterId` → `Encounter` (`Cascade`) | index `encounterId` |
| `itemId` → `StockItem` (`Restrict`), `itemName` | nama disalin saat disimpan |
| `quantity` Int | > 0 |
| `usage` String | aturan pakai, wajib, maks. 200 karakter |
| `sortOrder` Int | urutan tampil |

CHECK `encounter_prescription_values`: `quantity > 0 AND btrim("usage") <> ''`. Trigger `encounter_prescription_locked`
(pola `encounter_treatment_locked`): baris tidak bisa ditambah, diubah, atau dihapus bila kunjungannya sudah FINAL; pesan
diawali `rekam_medis_terkunci`. Tanpa TRUNCATE (pola `encounter_treatment_no_truncate`).

### 2.2 Perubahan tabel penyerahan

- Enum baru `DispensingSource` (`APOTEKER`, `DOKTER`); kolom `Dispensing.source` bawaan `APOTEKER` (penyerahan lama tetap
  `APOTEKER`).
- `DispensingLine.prescriptionId` String? unik → `EncounterPrescription` (`Restrict`): baris penyerahan yang berasal dari
  resep dokter.
- `DispensingLine.billedQuantity` Int? dan `billingNote` String?: jumlah yang akhirnya ditagih dan alasan resepsionis
  (null = ditagih sesuai resep; `billedQuantity = 0` = dihapus dari tagihan). CHECK: `billedQuantity IS NULL OR
  (billedQuantity >= 0 AND billedQuantity < quantity AND billingNote IS NOT NULL)`.

`Encounter.pharmacyNote` tetap ada untuk catatan lama; formulir kunjungan tidak lagi menampilkan atau mengisinya.

## 3. Formulir kunjungan dokter

- Bagian **"Resep"** menggantikan "Catatan untuk Apoteker". **+ Obat** menambah baris: Obat (pilihan dengan pencarian,
  barang aktif yang punya harga jual, stok cabang kunjungan), Jumlah, Aturan pakai. Baris bisa dihapus dan diurutkan ulang
  lewat urutan tambah.
- Setiap baris menampilkan sisa stok cabang itu dan satuan, tanpa harga. Bila jumlah total satu obat (semua barisnya)
  melebihi sisa stok, muncul peringatan: "Sisa stok 4 kapsul — tagihan tertahan sampai stok cukup atau jumlah
  dikurangi." Menyimpan dan memfinalkan tetap boleh (RD4).
- Resep disimpan bersama draf catatan (`saveEncounterDraft`), ditulis ulang utuh setiap simpan seperti daftar treatment.
  Validasi server: obat ada, aktif, punya harga jual; jumlah bilangan bulat 1–9999; aturan pakai 1–200 karakter; maks.
  30 baris.
- Catatan final menampilkan resep baca-saja beserta keterangan penagihan per baris (bagian 4).
- Adendum tidak mengubah resep.

## 4. Finalisasi catatan dan tagihan

- **Finalisasi catatan** (`finalizeEncounter`): bila resep berisi minimal satu baris, dalam transaksi yang sama dibuat
  `Dispensing` `source = DOKTER`, status `SELESAI`, `completedAt` = sekarang, `completedById/Name` = dokter, dan satu
  `DispensingLine` per baris resep (`prescriptionId` terisi, `itemName`, `quantity`, `usage`, `sortOrder` disalin). Bila
  draf tagihan kunjungan sudah ada, baris tagihan ditambahkan ke draf dalam transaksi yang sama (mekanisme yang dipakai
  penyelesaian Apoteker). Tanpa resep: tidak ada penyerahan. Kunjungan tidak pernah lagi membuat penyerahan `MENUNGGU`.
- **Buat tagihan** dari kunjungan: baris penyerahan Selesai ikut terisi seperti sekarang (`BARANG`, harga jual katalog,
  `dispensingLineId`). Untuk baris resep, jumlah = `quantity` resep.
- **Kurangi atau hapus** baris dari resep dokter (RD5), oleh resepsionis (`invoice:manage`) di draf: jumlah baru harus
  0 ≤ baru < jumlah resep; alasan wajib 2–200 karakter. Jumlah 0 menghapus baris tagihan. Server mengisi
  `DispensingLine.billedQuantity` dan `billingNote` (beserta nama resepsionis di audit `invoice.update`). Menaikkan jumlah
  atau mengganti obat ditolak. Baris dari penyerahan Apoteker lama tetap terkunci seperti sekarang.
- **Finalisasi tagihan**: aturan stok yang ada berlaku (stok kurang → ditolak dengan nama obat). Penahanan "Menunggu
  Apoteker" tidak pernah terjadi untuk penyerahan dari dokter.
- **Pembatalan tagihan**: penyerahan `source = DOKTER` tetap `SELESAI`; baris tagihan lamanya dilepas
  (`dispensingLineId = null`) dan `billedQuantity`/`billingNote` dikosongkan, sehingga tagihan baru berisi jumlah resep
  asli. Penyerahan `source = APOTEKER` tetap kembali `MENUNGGU` seperti sekarang.
- **Tampilan dokter** (catatan final): tiap baris resep menampilkan "Ditagih 5 dari 10 — <alasan>" atau "Tidak ditagih —
  <alasan>" bila `billedQuantity` terisi.

## 5. Etiket

`/admin/tagihan/<id>/etiket` (hak `invoice:read`): nama klinik, nama pasien, tanggal kunjungan, nama dokter, dan untuk
setiap baris tagihan yang berasal dari resep dokter: nama obat, jumlah yang ditagih, aturan pakai. Tanpa harga dan tanpa
data klinis. Tata letak cetak (`@media print`), tombol **Cetak** memanggil `window.print()`. Tombol **Cetak etiket**
tampil di editor draf dan tampilan final tagihan bila ada baris dari resep dokter. Etiket Apoteker lama
(`/admin/resep/[id]/etiket`) tetap ada.

## 6. Menu Resep (Apoteker) dan pemberitahuan

- Menu Resep tetap untuk menuntaskan penyerahan `MENUNGGU` lama dan riwayat. Penyerahan `source = DOKTER` tampil di tab
  Selesai dengan label "dari dokter", baca-saja: tanpa Buka kembali, tanpa ubah obat.
- Aksi Apoteker (`dispensing-drafts`, `dispensing-lifecycle`: ubah obat, Selesai, Tanpa obat, Buka kembali) menolak
  penyerahan `source = DOKTER`: "Resep dari dokter tidak diubah di sini."
- Lencana jumlah Menunggu dan pemberitahuan langsung "resep baru" berhenti dengan sendirinya karena tidak ada penyerahan
  `MENUNGGU` baru; tidak ada kode pemberitahuan yang diubah.

## 7. Hak akses

| Peran | Menulis resep | Lihat sisa stok di resep | Ubah baris resep di tagihan | Etiket tagihan |
|-------|---------------|---------------------------|-----------------------------|----------------|
| Dokter | ya (`record:write`) | ya, tanpa harga | tidak | tidak |
| Resepsionis | tidak | — | ya (`invoice:manage`) | ya |
| Admin Keuangan | tidak | — | tidak | ya (`invoice:read`) |
| Super Admin | ya | ya | ya | ya |
| Apoteker | tidak | — | tidak | tidak (etiket lama di menu Resep tetap) |

Pilihan obat untuk dokter memuat id, nama, kode, satuan, dan sisa stok cabang; tidak pernah harga.

## 8. Pengujian

- **Unit:** validasi baris resep (jumlah, aturan pakai, maks. baris); ringkasan peringatan stok per obat (menjumlahkan
  baris); validasi pengurangan (0 ≤ baru < resep, alasan wajib); bagian Resep di formulir kunjungan (tambah/hapus baris,
  peringatan stok); keterangan penagihan di catatan final; etiket.
- **Integrasi:** simpan draf menulis ulang resep; resep terkunci setelah final (trigger); finalisasi membuat penyerahan
  `DOKTER` `SELESAI` dengan baris yang sama, tanpa resep tidak membuat apa pun, tidak pernah `MENUNGGU`; draf tagihan yang
  sudah ada mendapat baris; buat tagihan mengisi baris; resepsionis mengurangi dan menghapus dengan alasan, menaikkan dan
  tanpa alasan ditolak, baris Apoteker lama tetap terkunci; pembatalan tagihan: penyerahan dokter tetap Selesai dan tagihan
  baru berisi jumlah asli; aksi Apoteker menolak penyerahan dokter; finalisasi tagihan menolak stok kurang; hak akses
  etiket dan pilihan obat tanpa harga.
- **E2E** (`tests/e2e/resep-dokter.spec.ts`, desktop dan ponsel): dokter menulis resep dua obat (satu melebihi stok →
  peringatan tampil) lalu memfinalkan → resepsionis membuat tagihan, mengurangi obat yang kurang dengan alasan, membuka
  etiket, memfinalkan → stok berkurang; dokter melihat "Ditagih … dari …" di catatan.
- **E2E lama:** `tests/e2e/resep.spec.ts` (dokter mengisi Catatan untuk Apoteker → Apoteker menyerahkan) tidak lagi
  bisa dijalankan karena formulir tidak punya kolom itu; diganti uji di atas. Pemeriksaan hak akses di dalamnya (Apoteker
  ditolak di `/admin/tagihan`, Dokter ditolak di `/admin/resep`) dipindahkan ke `resep-dokter.spec.ts`.

## 9. Di luar cakupan

Interaksi obat dan alergi otomatis, resep racikan, templat resep, kirim resep lewat WhatsApp, penghapusan menu Resep
Apoteker, perubahan resep setelah catatan final (selain lewat tagihan).
