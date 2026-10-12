# Desain — Struk Tagihan: Kirim lewat WhatsApp dan Cetak ke Printer Struk

- **Versi:** 1.1 (ditambah cetak struk lewat QZ Tray)
- **Tanggal:** 12 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** tabel `Invoice` (satu kolom baru), tampilan tagihan final di panel, satu halaman publik baru `/struk`, pembatas laju halaman publik, cetak struk ke printer thermal lewat QZ Tray (satu dependensi baru `qz-tray`, satu rute tanda tangan, satu kunci di server), dan tata letak cetak browser selebar kertas struk. Alur tagihan, pembayaran, dan pembatalan tidak berubah.

## 1. Latar belakang & tujuan

Kasir lama klinik (Kluto) bisa mengirim struk lewat WhatsApp dan mencetaknya ke printer struk di komputer kasir (Windows, lewat QZ Tray). Tagihan SunDY baru bisa dicetak lewat browser dengan tata letak A4. Tujuan: dari tagihan final, resepsionis (a) mengirim pesan WA ke pasien berisi total dan tautan ke struk online yang bisa dibuka pasien tanpa login, dan (b) mencetak struk ke printer thermal dengan satu klik.

Bukan tujuan: mengirim WA otomatis dari server (tetap lewat tautan `wa.me`, resepsionis menekan Kirim, seperti pesan booking), kirim struk lewat email, rating layanan, struk untuk tagihan draf, membuka laci kas, mencetak dari iPad/ponsel, dan memasang QZ Tray di komputer kasir (sudah terpasang).

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| S1 | Bentuk struk | Pesan singkat (total + status) dan **tautan ke struk online**. |
| S2 | Masa berlaku tautan | **Selamanya**, kecuali tagihan dibatalkan atau tautan diganti. |
| S3 | Mencabut tautan | Tombol **"Ganti tautan"** di tagihan: tautan lama langsung tidak berlaku. |
| S4 | Kode tautan | Bertanda tangan HMAC seperti link kuis (spec C3 bagian 6), di belakang `#`, tidak disimpan di basis data. |
| S5 | Printer struk | Komputer kasir Windows dengan **QZ Tray**; struk dikirim langsung (ESC/POS) tanpa dialog cetak. |
| S6 | Lebar kertas | Belum diketahui: **dipilih per komputer** (58 mm atau 80 mm), bawaan 80 mm. |

## 3. Data

Migrasi hanya menambah: `Invoice.receiptLinkVersion INT NOT NULL DEFAULT 0`. Kolom `Invoice.version` yang sudah ada tidak dipakai, karena ia naik setiap draf diubah dan saat finalisasi (penguncian optimistis draf), sehingga tautan akan mati tanpa sebab.

## 4. Kode tautan

- Bentuk: `{invoiceId}.{tanda tangan}`; tanda tangan = HMAC-SHA256(`{invoiceId}.{receiptLinkVersion}`) dengan kunci turunan `BETTER_AUTH_SECRET` berlabel `sundy:struk-link:v1`, dipotong 16 byte, base64url. Label berbeda dari link kuis, jadi kode kuis tidak pernah sah sebagai kode struk.
- URL: `{situs}/struk#{kode}`. Bagian `#` tidak dikirim browser ke server, jadi tidak tercatat di log nginx atau Cloudflare.
- Pemeriksaan memakai perbandingan waktu-konstan atas teks base64url, sama dengan `isValidQuizLinkCode`.
- "Ganti tautan" menaikkan `receiptLinkVersion` satu; semua kode lama langsung tidak sah.

## 5. Panel: tagihan final

Tagihan berstatus **Final** (lunas atau belum) mendapat dua aksi untuk peran dengan `invoice:manage` (Super Admin, Resepsionis):

- **"Kirim struk via WA"**: tautan `wa.me` ke nomor WhatsApp pasien dengan pesan:

  > Halo {nama depan}, terima kasih sudah berkunjung ke SunDY Clinic.
  > No. tagihan: {nomor}
  > Total: {total} ({LUNAS | sisa {sisa}})
  > Lihat struk lengkap: {tautan}

  Bila nomor pasien tidak sah, tombol WA tidak tampil dan hanya **"Salin pesan"** yang tersedia. "Salin pesan" selalu tersedia. Membuat pesan dicatat di audit (`invoice.receipt-link`) tanpa kode tautannya.
- **"Ganti tautan"**: dialog konfirmasi ("Tautan struk yang sudah terkirim tidak bisa dibuka lagi."), lalu versi naik dan dicatat di audit (`invoice.receipt-link-reset`).

Tagihan draf dan dibatalkan tidak punya aksi ini.

## 6. Halaman publik `/struk`

Halaman statis (tanpa login, `robots: noindex, nofollow`) yang membaca kode dari `#`, lalu memanggil aksi server `getPublicReceipt(kode)` yang dibatasi lajunya per alamat IP (pembatas yang sama polanya dengan halaman publik lain).

- **Ditampilkan:** nama klinik dan cabang (dengan alamat), nomor tagihan, tanggal final, nama pasien, daftar baris (nama, qty, harga satuan, total baris), subtotal, diskon (bila ada), total, pembayaran (tanggal, metode, jumlah; pembayaran yang ditarik tidak tampil), status Lunas atau sisa tagihan, nama kasir yang memfinalisasi, dan tombol **Cetak**.
- **Tidak pernah ditampilkan:** nomor WA, NIK, alamat pasien, catatan tagihan, alasan diskon, harga pokok, catatan medis, maupun data lain dari kunjungan.
- **Tagihan dibatalkan:** hanya "Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan." tanpa rincian.
- **Kode rusak, palsu, versi lama, atau tagihan tidak ada:** satu pesan yang sama, "Tautan struk tidak berlaku.", sehingga tidak bisa dibedakan mana yang ada.
- **Terlalu banyak permintaan:** pesan pembatas laju yang sama dengan halaman publik lain.

## 7. Cetak struk ke printer (QZ Tray)

### 7.1 Di panel

Tagihan final mendapat tombol **"Cetak struk"** (peran `invoice:manage`). Tombol "Cetak" lama tetap ada, untuk cetak lewat browser.

- **Pengaturan printer per komputer**, disimpan di browser komputer itu (`localStorage`), bukan di basis data, karena tiap komputer kasir punya printernya sendiri:
  - nama printer, dipilih dari daftar printer yang dilaporkan QZ Tray;
  - lebar kertas, 80 mm (48 karakter) atau 58 mm (32 karakter).

  Bila belum diatur, menekan "Cetak struk" membuka dialog pengaturan lebih dulu. Dialog yang sama bisa dibuka lagi lewat "Pengaturan printer".
- **Isi struk** (teks ESC/POS):
  - nama klinik, cabang, dan alamat cabang;
  - nomor tagihan, tanggal dan jam final, kasir, dan nama pasien;
  - baris item: nama, lalu `qty x harga` dan total di kanan, dengan nama panjang dibungkus ke baris berikutnya;
  - subtotal, diskon (bila ada), total, setiap pembayaran (metode dan jumlah), lalu status LUNAS atau sisa;
  - "Terima kasih", lalu potong kertas.

  Isinya sama dengan halaman struk publik (bagian 6), tanpa data yang dilarang di sana.
- **Galat dan pesannya:**
  - QZ Tray tidak berjalan: "QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi."
  - Printer tersimpan tidak ditemukan: "Printer \"{nama}\" tidak ditemukan. Pilih printer lagi." Dialog pengaturan langsung dibuka.
  - Pencetakan gagal: pesan galat dari QZ Tray ditampilkan apa adanya.

  Tidak ada yang tersimpan di server saat mencetak, kecuali catatan audit `invoice.receipt-print` (nomor tagihan saja).

### 7.2 Tanda tangan QZ Tray

Supaya QZ Tray tidak menampilkan dialog "izinkan situs ini?" setiap mencetak:

- **Kunci rahasia RSA 2048** (PKCS#8) dibuat di server lewat SSH dan disimpan sebagai berkas di luar folder rilis. Isinya tidak pernah lewat chat dan tidak masuk git. Lokasinya dibaca dari variabel lingkungan `QZ_PRIVATE_KEY_FILE`.
- **Sertifikat publiknya** (self-signed, berlaku 10 tahun) disajikan di rute `/admin/qz/sertifikat`, hanya untuk staf yang login. Klien QZ memuatnya lewat `setCertificatePromise`.
- **Rute tanda tangan** `/admin/qz/tanda-tangan` (POST, hanya staf dengan `invoice:manage`, hanya dari asal yang sama) menandatangani teks permintaan QZ dengan SHA512 dan mengembalikan base64. Klien memakai `setSignatureAlgorithm("SHA512")` dan `setSignaturePromise`.
- **Di komputer kasir** (dikerjakan pemilik, sekali): sertifikat yang sama disalin ke `C:\Program Files\QZ Tray\override.crt`, lalu QZ Tray dijalankan ulang. Langkahnya ditulis di runbook.
- **Bila kunci tidak diatur** (`QZ_PRIVATE_KEY_FILE` kosong): kedua rute menjawab 404, dan "Cetak struk" tetap bisa dipakai dengan dialog izin QZ Tray (mode tanpa tanda tangan). Sertifikat dimuat malas: rute tanda tangan memeriksa keberadaan berkas setiap permintaan, jadi kunci bisa dipasang tanpa deploy ulang (cukup restart aplikasi).

### 7.3 Cetak lewat browser (cadangan)

Tombol "Cetak" yang sudah ada mendapat gaya cetak struk sempit: lebar 80 mm, tanpa menu, huruf monospace. Ini untuk komputer tanpa QZ Tray atau saat QZ Tray bermasalah.

## 8. Teknis

- `src/server/receipt-link-code.ts` (khusus server): kunci, buat kode, uraikan, periksa; pola `quiz-link-code.ts`.
- `src/lib/receipt.ts` (murni): teks pesan WA dan bentuk data struk publik `PublicReceipt` dari tagihan.
- `src/server/receipt.ts`: `getReceiptMessage(invoiceId)` dan `resetReceiptLink(invoiceId)` (hak `invoice:manage`), dan `getPublicReceipt(code)` (publik, dibatasi laju).
- Panel: komponen tombol di `invoice-final-view.tsx`. Halaman: `src/app/(public)/struk/page.tsx` dan komponen klien pembaca kode.
- `src/lib/receipt-escpos.ts` (murni): `PublicReceipt` + lebar kertas → perintah ESC/POS (inisialisasi, rata tengah untuk kepala, teks dibungkus per lebar, garis pemisah, potong kertas). Teks non-ASCII disederhanakan (mis. "é" → "e") karena printer thermal memakai halaman kode terbatas.
- `src/components/admin/billing/receipt-printer.ts` (klien): memuat `qz-tray` secara dinamis hanya saat tombol ditekan, menyambung, mencari printer, mengirim data.
- `src/server/qz-signing.ts` (khusus server): membaca kunci dan menandatangani. Rute di `src/app/(admin)/admin/qz/`.
- Dependensi baru: `qz-tray` versi persis 2.3.0 (dikunci, `--save-exact`).

## 9. Keamanan dan privasi

- Tautan bisa diteruskan; karena itu isi struk dibatasi pada yang memang tertulis di struk kasir biasa, tanpa nomor WA, NIK, atau alamat pasien.
- Kode tidak bisa ditebak dari nomor tagihan, tidak tersimpan di basis data (backup basis data saja tidak cukup untuk membuat tautan), dan tidak tercatat di log server.
- Pembatas laju mencegah percobaan massal; semua kegagalan terlihat sama.
- Audit mencatat siapa membuat dan mengganti tautan, tanpa kodenya.
- Kunci QZ hanya ada di server; rute tanda tangan hanya untuk staf berhak dari asal yang sama, sehingga situs lain tidak bisa memakai tanda tangan SunDY untuk mencetak lewat QZ Tray kasir tanpa izin.

## 10. Pengujian

- **Unit:** teks pesan (lunas, belum lunas, nama depan); kode (sah, palsu, label kuis, versi lama); bentuk `PublicReceipt` (pembayaran yang ditarik tidak ikut, tanpa data terlarang); komponen tombol (tanpa nomor sah hanya Salin) dan halaman (semua keadaan).
- **Integrasi:** `getPublicReceipt` hanya memuat kolom yang diizinkan; tagihan dibatalkan dan "Ganti tautan" mematikan tautan lama; draf tidak bisa dibuatkan tautan; hak `invoice:manage` di kedua aksi panel; audit tanpa kode.
- **Unit (cetak):** ESC/POS untuk 58 dan 80 mm (lebar baris, pembungkusan nama panjang, diskon, cicilan, sisa, potong kertas, teks non-ASCII); komponen cetak dengan QZ tiruan (belum diatur → dialog pengaturan, printer tidak ada, QZ tidak tersambung, berhasil).
- **Integrasi (cetak):** rute tanda tangan menolak tanpa login, tanpa hak, dan asal lain; menghasilkan tanda tangan SHA512 yang lolos verifikasi sertifikat; 404 bila kunci tidak diatur.
- **E2E:** resepsionis menekan "Kirim struk via WA" pada tagihan final, tautan dari pesan dibuka di konteks tanpa login dan rinciannya cocok, lalu "Ganti tautan" membuat tautan lama tidak berlaku. Desktop dan ponsel. Di komputer uji tidak ada QZ Tray, jadi E2E cetak hanya memastikan pesan "QZ Tray tidak tersambung" tampil; pencetakan sungguhan diuji pemilik di komputer kasir.

## 11. Rilis dan risiko

- Migrasi hanya menambah satu kolom berbawaan 0; `deploy.sh kembali` aman.
- Bila `BETTER_AUTH_SECRET` diganti, semua tautan struk (dan link kuis) lama tidak berlaku; ini sudah berlaku untuk link kuis dan dicatat di runbook.
- Tautan selamanya berarti tautan yang terkirim ke orang lain tetap terbuka sampai resepsionis menekan "Ganti tautan".
- Setelah deploy: Claude membuat kunci QZ di server (SSH) dan mengisi `QZ_PRIVATE_KEY_FILE`; pemilik memasang `override.crt` di komputer kasir. Sebelum itu, "Cetak struk" tetap berfungsi dengan dialog izin QZ Tray.
- Versi QZ Tray di komputer kasir perlu 2.1 atau lebih baru (SHA512 dan `override.crt`). Bila lebih lama, kasir perlu memperbaruinya.
- Printer yang tidak memahami perintah potong kertas tetap mencetak; kertasnya disobek manual.
