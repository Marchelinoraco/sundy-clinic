# Desain — Kirim Struk Tagihan lewat WhatsApp

- **Versi:** 1.0
- **Tanggal:** 12 Oktober 2026
- **Status:** Menunggu tinjauan pemilik
- **Menyentuh:** tabel `Invoice` (satu kolom baru), tampilan tagihan final di panel, satu halaman publik baru `/struk`, dan pembatas laju halaman publik. Alur tagihan, pembayaran, dan pembatalan tidak berubah.

## 1. Latar belakang & tujuan

Kasir lama klinik (Kluto) bisa mengirim struk lewat WhatsApp. Tagihan SunDY baru bisa dicetak lewat browser. Tujuan: dari tagihan final, resepsionis mengirim pesan WA ke pasien berisi total dan tautan ke struk online yang bisa dibuka pasien tanpa login.

Bukan tujuan: mengirim WA otomatis dari server (tetap lewat tautan `wa.me`, resepsionis menekan Kirim, seperti pesan booking), kirim struk lewat email, rating layanan, dan struk untuk tagihan draf.

## 2. Keputusan

| # | Pertanyaan | Keputusan |
|---|---|---|
| S1 | Bentuk struk | Pesan singkat (total + status) dan **tautan ke struk online**. |
| S2 | Masa berlaku tautan | **Selamanya**, kecuali tagihan dibatalkan atau tautan diganti. |
| S3 | Mencabut tautan | Tombol **"Ganti tautan"** di tagihan: tautan lama langsung tidak berlaku. |
| S4 | Kode tautan | Bertanda tangan HMAC seperti link kuis (spec C3 bagian 6), di belakang `#`, tidak disimpan di basis data. |

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

## 7. Teknis

- `src/server/receipt-link-code.ts` (khusus server): kunci, buat kode, uraikan, periksa; pola `quiz-link-code.ts`.
- `src/lib/receipt.ts` (murni): teks pesan WA dan bentuk data struk publik `PublicReceipt` dari tagihan.
- `src/server/receipt.ts`: `getReceiptMessage(invoiceId)` dan `resetReceiptLink(invoiceId)` (hak `invoice:manage`), dan `getPublicReceipt(code)` (publik, dibatasi laju).
- Panel: komponen tombol di `invoice-final-view.tsx`. Halaman: `src/app/(public)/struk/page.tsx` dan komponen klien pembaca kode.

## 8. Keamanan dan privasi

- Tautan bisa diteruskan; karena itu isi struk dibatasi pada yang memang tertulis di struk kasir biasa, tanpa nomor WA, NIK, atau alamat pasien.
- Kode tidak bisa ditebak dari nomor tagihan, tidak tersimpan di basis data (backup basis data saja tidak cukup untuk membuat tautan), dan tidak tercatat di log server.
- Pembatas laju mencegah percobaan massal; semua kegagalan terlihat sama.
- Audit mencatat siapa membuat dan mengganti tautan, tanpa kodenya.

## 9. Pengujian

- **Unit:** teks pesan (lunas, belum lunas, nama depan); kode (sah, palsu, label kuis, versi lama); bentuk `PublicReceipt` (pembayaran yang ditarik tidak ikut, tanpa data terlarang); komponen tombol (tanpa nomor sah hanya Salin) dan halaman (semua keadaan).
- **Integrasi:** `getPublicReceipt` hanya memuat kolom yang diizinkan; tagihan dibatalkan dan "Ganti tautan" mematikan tautan lama; draf tidak bisa dibuatkan tautan; hak `invoice:manage` di kedua aksi panel; audit tanpa kode.
- **E2E:** resepsionis menekan "Kirim struk via WA" pada tagihan final, tautan dari pesan dibuka di konteks tanpa login dan rinciannya cocok, lalu "Ganti tautan" membuat tautan lama tidak berlaku. Desktop dan ponsel.

## 10. Rilis dan risiko

- Migrasi hanya menambah satu kolom berbawaan 0; `deploy.sh kembali` aman.
- Bila `BETTER_AUTH_SECRET` diganti, semua tautan struk (dan link kuis) lama tidak berlaku; ini sudah berlaku untuk link kuis dan dicatat di runbook.
- Tautan selamanya berarti tautan yang terkirim ke orang lain tetap terbuka sampai resepsionis menekan "Ganti tautan".
