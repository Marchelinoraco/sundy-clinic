# Stok gudang dan stok meja resepsionis — desain

Tanggal: 14 Oktober 2026 · Status: menunggu tinjauan pemilik

Melanjutkan: `docs/superpowers/specs/2026-10-07-stok-hutang-design.md` (stok per cabang, batch, FEFO),
`docs/superpowers/specs/2026-10-14-harga-modal-margin-komisi-design.md` (harga beli oleh Admin Keuangan),
`docs/superpowers/specs/2026-10-18-resep-dokter-design.md` (resep dokter langsung masuk tagihan).

## 1. Tujuan

Sekarang setiap cabang hanya punya satu stok. Pemilik ingin stok tiap cabang terbagi dua:

- **gudang**, dikelola Apoteker;
- **meja resepsionis**, tempat obat dan produk diserahkan ke pasien.

Kalau stok meja habis, resepsionis meminta restock kepada Apoteker, dan Apoteker memindahkan barang dari gudang ke meja.

Fitur ini berhasil bila:

- barang masuk dari supplier tercatat di gudang;
- tagihan mengurangi stok meja;
- resepsionis melihat stok meja dan diingatkan saat menipis atau habis;
- resepsionis bisa mengirim permintaan restock, dan Apoteker bisa mengirim seluruh atau sebagian jumlahnya, atau menolak dengan alasan;
- kedua pihak menerima pemberitahuan langsung, dan setiap perpindahan tercatat di riwayat stok.

### Keputusan pemilik

| No | Keputusan |
|----|-----------|
| SM1 | Tagihan mengambil stok **meja**. Bila stok meja kurang, finalisasi tagihan ditolak sampai meja diisi. |
| SM2 | Resepsionis membuat permintaan (tombol **Minta restock**); sistem menandai barang yang stok mejanya menipis atau habis. |
| SM3 | Berlaku untuk **obat dan produk**. |
| SM4 | Saat Apoteker mengirim, stok **langsung** pindah ke meja (tanpa konfirmasi terima). Jumlah kirim boleh kurang dari yang diminta. |
| SM5 | Tiap barang punya **Batas meja** sendiri, diisi Apoteker; batas menipis yang ada tetap untuk gudang. |
| SM6 | Hanya Apoteker (dan Super Admin) yang memindahkan, menarik, dan menyesuaikan stok meja. Resepsionis melihat dan meminta. |
| SM7 | Stok yang ada saat fitur dipasang seluruhnya menjadi stok **gudang**; meja mulai dari 0. |
| SM8 | Pendekatan: satu batch dengan dua angka sisa (gudang dan meja). |

## 2. Data

Migrasi hanya menambah: `20261019085000_stok_meja_enum` (nilai enum, lihat 2.2) lalu `20261019090000_stok_meja`.

### 2.1 Batch dan barang

- `StockBatch.quantityRemaining` tetap ada dan kini berarti **sisa gudang**. Komentar skema diperbarui.
- `StockBatch.counterRemaining` Int, bawaan 0: **sisa meja**. CHECK `stock_batch_counter_nonnegative`:
  `"counterRemaining" >= 0`.
- `StockItem.counterMinStock` Int, bawaan 0: **Batas meja**. 0 berarti barang ini tidak dipantau di meja (tanpa
  tanda). CHECK `stock_item_counter_min_nonnegative`: `"counterMinStock" >= 0`.

### 2.2 Jurnal stok

- Enum baru `StockLocation` (`GUDANG`, `MEJA`). Kolom `StockMovement.location` bawaan `GUDANG`. Semua jurnal lama
  menjadi `GUDANG`, dan itu benar karena dulu hanya ada satu lokasi.
- Nilai baru di `StockMovementKind`: `PINDAH`. Satu perpindahan dicatat sebagai **dua** jurnal pada batch yang sama:
  - Gudang ke meja: `GUDANG −n` dan `MEJA +n`.
  - Meja ke gudang (tarik): `GUDANG +n` dan `MEJA −n`.
  - Nilai `PINDAH` ditambahkan dengan `ALTER TYPE "StockMovementKind" ADD VALUE 'PINDAH'` di migrasi terpisah
    `20261019085000_stok_meja_enum`, sebelum migrasi utama. PostgreSQL tidak mengizinkan nilai enum baru dipakai di
    transaksi yang sama, dan CHECK di 2.2 memakainya. Polanya sama dengan `20261014090000_paket_enum`.
- `StockMovement.restockLineId` String? → `RestockRequestLine` (`SetNull`): menautkan jurnal `PINDAH` ke baris
  permintaannya.
- Lokasi jurnal yang lain:
  - `KELUAR` dari tagihan selalu `MEJA`.
  - Pengembalian karena tagihan dibatalkan (`PENYESUAIAN`) selalu `MEJA`.
  - `MASUK`, `RETUR`, dan pembatalan faktur selalu `GUDANG`.
  - `PENYESUAIAN` oleh Apoteker memakai lokasi yang ia pilih.
  - CHECK `stock_movement_location`:
    `("kind" IN ('MASUK','RETUR') AND "location" = 'GUDANG') OR "kind" IN ('PINDAH','PENYESUAIAN','KELUAR')`.
    Ekspresi ini tidak pernah NULL karena kedua kolomnya NOT NULL.

### 2.3 Permintaan restock (baru)

`RestockRequest`:

| Kolom | Keterangan |
|-------|------------|
| `id`, `branchId` → `Branch` (`Restrict`) | cabang yang meminta |
| `status` enum `RestockStatus` (`MENUNGGU`, `SELESAI`, `DITOLAK`, `DIBATALKAN`) | bawaan `MENUNGGU` |
| `note` String? | catatan resepsionis, maks. 300 karakter |
| `requestedById`, `requestedByName` | peminta |
| `decidedAt`, `decidedById`, `decidedByName` | Apoteker yang mengirim atau menolak, atau resepsionis yang membatalkan |
| `rejectReason` String? | wajib bila `DITOLAK` (2–200 karakter) |
| `version` Int | naik setiap perubahan |
| `createdAt` | index `[status, createdAt]`, `[branchId, status]` |

CHECK `restock_request_decision`:

- `status = 'MENUNGGU'` → `decidedAt IS NULL AND rejectReason IS NULL`;
- status lain → `decidedAt IS NOT NULL`;
- `rejectReason IS NOT NULL` ↔ `status = 'DITOLAK'`.

Ekspresinya ditulis dengan `COALESCE`/`IS` agar tidak pernah NULL.

`RestockRequestLine`:

| Kolom | Keterangan |
|-------|------------|
| `id`, `requestId` → `RestockRequest` (`Cascade`) | |
| `itemId` → `StockItem` (`Restrict`), `itemName` | nama disalin |
| `requestedQuantity` Int | > 0, maks. 9.999 |
| `sentQuantity` Int? | diisi saat `SELESAI`, 0 ≤ kirim ≤ 999.999 |
| `sortOrder` Int | |

CHECK `restock_line_values`: `requestedQuantity > 0 AND (sentQuantity IS NULL OR sentQuantity >= 0)`. Satu
permintaan berisi 1–30 barang, dan barang yang sama tidak boleh muncul dua kali dalam satu permintaan.

## 3. Aturan stok

- **Barang masuk** membuat batch dengan gudang = jumlah masuk dan meja = 0.
- **Tersedia** = sisa pada batch yang belum kedaluwarsa, dihitung terpisah untuk gudang dan meja.
  - Batch kedaluwarsa di meja tetap terhitung di meja dan ditandai "kedaluwarsa di meja".
  - Batch kedaluwarsa tidak bisa dijual atau dipindah. Apoteker menarik atau membuangnya lewat penyesuaian.
- **Pindah ke meja** (Apoteker), untuk satu barang dan jumlah di satu cabang:
  - Sistem mengambil dari batch gudang yang belum kedaluwarsa, mulai dari kedaluwarsa terdekat (aturan FEFO yang
    sama dengan tagihan).
  - Setiap batch diperbarui dengan satu UPDATE bersyarat (`quantityRemaining >= n`): gudang berkurang n dan meja
    bertambah n.
  - Bila gudang yang tersedia kurang, ditolak dengan pesan "Sisa gudang <barang> tidak cukup (tersedia N)."
- **Tarik ke gudang** (Apoteker): per batch, dari detail barang. Jumlahnya 1 sampai sisa meja batch itu, dengan
  UPDATE bersyarat pada `counterRemaining`. Batch kedaluwarsa boleh ditarik.
- **Tagihan difinalkan:** FEFO atas batch yang meja-nya bersisa dan belum kedaluwarsa (`counterRemaining`).
  - Bila kurang, ditolak dengan pesan "Stok meja <barang> di <cabang> tidak cukup (tersedia N). Minta restock ke
    Apoteker."
  - Jurnal `KELUAR` dicatat dengan lokasi `MEJA`. Pemakaian stok tagihan (`InvoiceStockUse`) tetap mencatat batch dan
    harga beli seperti sekarang.
- **Tagihan dibatalkan:** stok yang dipakai tagihan kembali ke `counterRemaining`. Jurnal `PENYESUAIAN`-nya
  berlokasi `MEJA`.
- **Retur ke supplier:** hanya dari sisa gudang. Pesannya "Sisa gudang <barang> (batch X) tidak cukup untuk
  diretur."
- **Batal faktur:** syarat yang ada tetap berlaku (batch utuh dan hanya punya satu jurnal). Batch yang pernah
  dipindah ke meja otomatis tidak bisa dibatalkan.
- **Penyesuaian** (rusak, hilang, kedaluwarsa dibuang, lainnya, selisih hitung): Apoteker memilih lokasi
  **Gudang** atau **Meja**. Pengurangan memakai UPDATE bersyarat pada kolom lokasi itu.
  - Pemeriksaan "faktur sudah dibatalkan" dipindahkan ke dalam transaksi, sesudah faktur dikunci (`lockInvoice`).
    Dengan begitu penyesuaian dan pembatalan faktur tidak bisa saling menyalip (temuan pemeriksaan alur Stok
    14 Okt 2026).
- **Nilai stok** (harga beli) = (gudang + meja) × harga beli batch.
- **Tanda:**
  - Gudang:
    - **Menipis:** gudang tersedia ≤ batas menipis, bila batas menipis > 0. Ini pengganti arti lama.
    - **Segera kedaluwarsa** dan **Kedaluwarsa:** dilihat dari batch yang masih bersisa di gudang maupun meja.
  - Meja (hanya barang dengan Batas meja > 0):
    - **Meja menipis:** 0 < meja tersedia ≤ Batas meja.
    - **Meja habis:** meja tersedia = 0.

## 4. Permintaan restock

### 4.1 Resepsionis

- **Halaman "Stok meja"** (`/admin/stok-meja`, hak `counter:read`):
  - Isinya daftar barang aktif dengan meja tersedia, Batas meja, dan tanda Meja menipis, Meja habis, atau
    kedaluwarsa di meja.
  - Saringannya "Perlu restock" (bawaan bila ada) dan "Semua".
  - Pemilih cabang tampil bila ada lebih dari satu cabang aktif.
  - Halaman ini tanpa harga beli dan tanpa sisa gudang.
- **Lencana di menu Stok meja:** jumlah barang yang meja-nya menipis atau habis, dihitung di semua cabang aktif.
- **Minta restock** (hak `restock:request`):
  - Dialognya terisi barang yang menipis atau habis dan belum diminta. Jumlah usulannya
    `max(2 × Batas meja − meja tersedia, 1)`, bisa diubah.
  - Resepsionis boleh menambah barang aktif lain lewat pencarian, dan mengisi catatan opsional.
  - Barang yang masih ada di permintaan `MENUNGGU` cabang yang sama ditandai "Sudah diminta" dan tidak bisa dipilih.
  - Server memeriksa ulang aturan ini di dalam transaksi, sesudah mengunci baris cabang (`SELECT … FOR UPDATE`),
    agar dua permintaan bersamaan tidak lolos. Pesannya: "<barang> sudah ada di permintaan yang menunggu."
- **Daftar permintaan** di halaman Stok meja: permintaan menunggu di atas, lalu riwayat 50 terakhir.
  - Setiap baris memuat status, peminta, waktu, jumlah diminta dan dikirim, serta alasan penolakan.
  - Permintaan `MENUNGGU` bisa **Dibatalkan** oleh pemegang `restock:request`.
- **Draf tagihan:**
  - Tiap baris barang menampilkan "Stok meja kurang (tersedia N)" bila meja tersedia di cabang tagihan kurang dari
    jumlah baris. Jumlah semua baris barang yang sama dijumlahkan.
  - Bila ada baris yang kurang, muncul tombol **Minta restock**. Tombol ini membuka dialog yang sama, terisi barang
    yang kurang dengan jumlah kekurangannya.
  - Daftar "Tambah barang" menampilkan meja tersedia.

### 4.2 Apoteker

- **Tab "Permintaan"** di menu Stok (`/admin/stok?tab=permintaan`, hak `stock:manage`), dengan lencana jumlah
  permintaan menunggu:
  - Daftar menunggu diurutkan dari yang terlama.
  - Lalu riwayat.
- **Rincian permintaan:**
  - Tiap baris memuat barang, diminta, gudang tersedia, dan isian **Dikirim**. Isian Dikirim langsung terisi
    `min(diminta, gudang tersedia)`.
  - **Kirim:**
    - Setiap baris dengan Dikirim > 0 dipindah lewat aturan Pindah ke meja (bagian 3), dengan jurnal yang tertaut ke
      barisnya.
    - Baris dengan Dikirim = 0 tidak dipindah.
    - Minimal satu baris > 0. Bila semuanya 0, gunakan Tolak.
    - Status menjadi `SELESAI`.
  - **Tolak:** wajib alasan 2–200 karakter. Status menjadi `DITOLAK` dan stok tidak berubah.
  - Kirim dan Tolak memakai `version`. Permintaan yang sudah diputus atau dibatalkan ditolak dengan pesan
    "Permintaan ini sudah diproses. Muat ulang halaman."
- **Isi meja tanpa permintaan:**
  - Bisa dari halaman Stok meja (tombol **Isi meja** per barang) atau dari detail barang (tombol **Pindah ke meja**).
  - Dicatat sebagai jurnal `PINDAH` tanpa tautan permintaan.
  - Bila barang itu sedang ada di permintaan menunggu, permintaannya tidak berubah.
- **Batas meja** diubah di formulir barang (**Ubah barang**) oleh pemegang `stock:manage`.

## 5. Pemberitahuan langsung

Sistem pemberitahuan yang ada (`src/server/live-events.ts`, diperbarui tiap 10 detik) mendapat tiga jenis baru:

| Jenis | Penerima | Teks | Tautan |
|-------|----------|------|--------|
| `RESTOCK_BARU` | `stock:manage` | "Permintaan restock dari <peminta>: N barang" | rincian permintaan |
| `RESTOCK_SELESAI` | `restock:request` | "Restock dikirim: N barang" | Stok meja |
| `RESTOCK_DITOLAK` | `restock:request` | "Permintaan restock ditolak: <alasan>" | Stok meja |

Super Admin memegang keduanya, jadi menerima semua jenis. Permintaan yang dibatalkan tidak memicu pemberitahuan.

## 6. Tampilan lain

- **Menu Stok, tab Barang** (`stock:read`):
  - Kolom "Stok tersedia" diganti **Gudang** dan **Meja**, masing-masing hanya yang tersedia, dengan keterangan
    jumlah kedaluwarsa.
  - Ringkasan cabang menambah "Meja menipis/habis".
  - Saringan tanda menambah "Meja menipis" dan "Meja habis".
- **Detail barang:**
  - Tabel batch memuat kolom **Gudang** dan **Meja**.
  - Aksi per batch: **Penyesuaian** (dengan pilihan lokasi) dan **Tarik ke gudang** (bila meja > 0).
  - Di kepala halaman: **Pindah ke meja** (barang dan jumlah, FEFO) dan "Batas meja N".
  - Riwayat stok memuat kolom **Lokasi**. Jenis `PINDAH` berlabel "Pindah".
- **Dasbor:**
  - Pemegang `stock:manage` mendapat kotak "Permintaan restock menunggu".
  - Pemegang `counter:read` tanpa `stock:manage` (resepsionis) mendapat kotak "Stok meja menipis / habis".
- **Dokter:**
  - Pilihan obat di resep dan halaman `/admin/stok-dokter` menampilkan tersedia **gudang + meja**.
  - Peringatan "Sisa stok … tagihan tertahan" memakai angka gabungan itu.
  - Dokter tidak melihat rincian per lokasi.
- **Menu Resep (penyerahan Apoteker lama):** pilihan obatnya menampilkan gudang + meja. Obatnya tetap ditagih dari
  meja.

## 7. Hak akses

Kemampuan baru:

- `counter:read`: Resepsionis, Apoteker, Super Admin.
- `restock:request`: Resepsionis, Super Admin.

Memenuhi, menolak, memindah, menarik, menyesuaikan, dan mengatur Batas meja memakai `stock:manage` (Apoteker, Super
Admin).

| Peran | Stok meja | Minta / batal restock | Kirim, tolak, pindah, tarik, penyesuaian, Batas meja | Gudang & menu Stok |
|-------|-----------|-----------------------|------------------------------------------------------|--------------------|
| Resepsionis | lihat | ya | tidak | tidak |
| Apoteker | lihat | tidak | ya | ya |
| Super Admin | lihat | ya | ya | ya |
| Admin Keuangan | tidak | tidak | tidak | lihat (seperti sekarang) |
| Dokter | tidak | tidak | tidak | tidak; hanya gabungan saat menulis resep |

Resepsionis tidak pernah menerima harga beli atau sisa gudang.

## 8. Peralihan

- Migrasi mengisi `counterRemaining = 0` dan `counterMinStock = 0` untuk semua baris. Semua jurnal lama berlokasi
  `GUDANG`.
- Setelah deploy, tagihan yang berisi barang tertahan sampai Apoteker mengisi meja. Data di server saat ini masih
  dummy (lihat catatan data dummy).

## 9. Pengujian

- **Unit:**
  - Rencana pindah FEFO dari gudang, menolak gudang yang kurang, dan melewati batch kedaluwarsa.
  - Tanda meja (menipis, habis, tanpa tanda bila Batas meja 0).
  - Jumlah usulan permintaan.
  - Validasi permintaan (1–30 barang, tanpa barang ganda, jumlah 1–9.999, catatan maks. 300).
  - Validasi kirim (0 ≤ kirim, minimal satu > 0) dan tolak (alasan 2–200).
  - Dialog Minta restock, tabel Stok meja, tanda di draf tagihan, dan kolom Gudang/Meja.
- **Integrasi:**
  - Barang masuk ke gudang.
  - Pindah dan tarik memperbarui kedua angka dan mencatat dua jurnal.
  - Tagihan mengambil dari meja dan menolak bila meja kurang meskipun gudang cukup.
  - Pembatalan tagihan mengembalikan ke meja.
  - Retur dan batal faktur hanya dari gudang; faktur yang batch-nya pernah dipindah tidak bisa dibatalkan.
  - Penyesuaian per lokasi, dan penyesuaian yang bersamaan dengan batal faktur.
  - Permintaan ganda untuk barang yang sama ditolak, termasuk dua permintaan bersamaan.
  - Kirim sebagian, kirim yang melebihi gudang ditolak, tolak, batal, dan versi usang.
  - Pemberitahuan dan penerimanya.
  - Hak akses tiap peran, termasuk resepsionis yang tidak menerima harga beli atau sisa gudang.
  - Dokter melihat angka gabungan.
- **Uji yang ada:** dunia uji tagihan (`tests/integration/invoice-world.ts`) mendapat cara mengisi meja. Uji tagihan
  yang ada mengisi meja lebih dulu.
- **E2E** (`tests/e2e/stok-meja.spec.ts`, desktop dan ponsel):
  - Apoteker mencatat barang masuk dan mengatur Batas meja.
  - Resepsionis melihat Meja habis dan meminta restock.
  - Apoteker menerima pemberitahuan, lalu mengirim sebagian.
  - Resepsionis menerima pemberitahuan dan melihat stok meja.
  - Tagihan difinalkan, lalu meja berkurang sementara gudang tetap.
  - Pemeriksaan hak akses.
- **E2E yang ada:** E2E yang menagih barang (`tagihan`, `resep-dokter`, `stok-hutang`, `harga-modal`, `struk`, dan
  yang lain yang memfinalkan tagihan berisi barang) mendapat langkah isi meja lewat helper `isiMeja`.

## 10. Di luar cakupan

- Stok opname banyak barang sekaligus.
- Pindah stok antar cabang.
- Konfirmasi terima oleh resepsionis.
- Permintaan restock otomatis tanpa tombol.
- Stok meja untuk peran lain (misalnya ruang dokter).
- Batas meja per cabang. Batas meja berlaku sama untuk semua cabang, seperti batas menipis sekarang.
- Pemberitahuan untuk Admin Keuangan tentang faktur yang menunggu harga beli. Ini dicatat dari pemeriksaan alur Stok
  dan bisa menjadi sub-proyek kecil terpisah.
