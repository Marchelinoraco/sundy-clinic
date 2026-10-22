# Desain — Invoice A4 dengan kop surat, cap air status, dan progres paket

- **Tanggal:** 22 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Contoh tampilan yang disetujui:** `.superpowers/brainstorm/…/invoice-a4.html`
- **Melanjutkan:**
  - `2026-10-12-struk-tagihan` (struk kasir dan tautan `/struk`)
  - paket barang (`2026-10-21-paket-barang-design.md`)
- **Sesudahnya:** penjadwalan dan pengingat sesi paket, sebagai proyek terpisah.

## 1. Tujuan

Pasien perlu melihat paket yang sudah dibelinya beserta sisanya, misalnya:
- "1 dari 4 sesi terpakai";
- "7 dari 28 kapsul diterima".

Pasien melihatnya lewat invoice. Pemilik juga ingin invoice yang rapi: kop surat klinik dan cap air status bayar.

**Berhasil bila:**
- pasien yang membuka tautan WhatsApp bisa melihat invoice A4 lalu mencetaknya atau menyimpannya sebagai PDF;
- staf bisa mencetak invoice A4 dari panel admin;
- angka paket di invoice cocok dengan keadaan pada hari invoice itu.

**Gagal walau jalan bila:**
- invoice lama berubah angkanya setelah pasien datang lagi;
- invoice yang belum dibayar atau dibatalkan tampak seperti sudah lunas.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| IA1 | Invoice A4 **ditambahkan**. Struk kasir yang sempit tetap ada untuk printer kasir dan tautan struk. | pemilik |
| IA2 | **Kop surat** disusun dari data di sistem: wordmark SunDY ("Sun" emas, "DY" cokelat), "Nutrition, Slimming & Wellness Clinic", nama dan alamat cabang tagihan, WhatsApp, Instagram, dan sundyclinic.com. Ada garis emas di bawah kop. | pemilik |
| IA3 | **Cap air miring** di tengah halaman menurut status: **LUNAS** (hijau), **DEPOSIT** (oranye, dibayar sebagian), **BELUM DIBAYAR** (abu-abu), **DIBATALKAN** (merah). | pemilik |
| IA4 | Isi invoice: judul INVOICE, nomor, tanggal final, kasir, nama pasien dan nomor RM, tabel item (nama, keterangan baris, jumlah dengan satuan, harga, total, diskon), subtotal, diskon, total, riwayat pembayaran, sisa, ucapan terima kasih, dan kaki halaman. | pemilik |
| IA4a | **Rekening yang tampil hanyalah rekening tujuan yang dipilih untuk pembayaran**, yaitu salinan label rekening (`destinationLabel`) pada setiap pembayaran transfer yang tidak dibatalkan. Rekening itu ditulis di baris riwayat pembayarannya, misalnya "22 Okt 2026 · Transfer ke BCA 123… a.n. SunDY Clinic". Pembayaran tunai dan QRIS tanpa rekening, dan tidak ada daftar rekening klinik lain. | pemilik |
| IA4b | **Setiap pembayaran yang tidak dibatalkan tercantum** di invoice, apa pun metodenya: tanggal, metode, dan nominal. Contohnya "22 Okt 2026 · Tunai · Rp 500.000" atau "29 Okt 2026 · EDC BCA · Rp 185.000". Transfer menambahkan rekening tujuannya (IA4a). | pemilik |
| IA12 | **Metode pembayaran baru EDC.** Di dialog Catat pembayaran, resepsionis memilih **mesin EDC** dari daftar **rekening klinik** yang sudah ada di Pengaturan (mesin EDC suatu bank menyetor ke rekening klinik di bank itu). Pilihannya tersimpan sebagai rekening tujuan pembayaran, sama seperti transfer, tetapi tanpa data pengirim. Kode approval boleh diisi di kolom referensi. EDC tampil di invoice A4, struk kasir, dan laporan. | pemilik |
| IA13 | EDC hanya untuk pembayaran dari customer. Pembayaran ke supplier tetap Tunai, Transfer, atau QRIS. | Claude |
| IA5 | Kotak **"Paket Anda"** memuat setiap paket yang **dibeli atau dipakai** di invoice itu: nama paket, masa berlaku, dan per isinya "n dari m sesi terpakai · sisa k" atau "n dari m {satuan} diterima · sisa k", dengan batang progres. | pemilik |
| IA6 | Angka paket **per tanggal invoice**, artinya keadaan buku sesi sesaat sesudah invoice itu difinalkan. Angka paket di invoice lama tidak pernah berubah. Sebaliknya, **cap air dan riwayat pembayaran selalu terkini**, supaya pelunasan DEPOSIT mengubah cap menjadi LUNAS (IA7). | pemilik (status terkini: Claude, mengikuti IA7) |
| IA7 | Setiap kunjungan menghasilkan invoice baru dengan progres terbaru. Pelunasan DEPOSIT dicatat di invoice pembelian paket, sehingga capnya berubah menjadi LUNAS. | pemilik (alur yang sudah ada) |
| IA8 | **Pasien** membuka invoice A4 dari tautan struk yang sama, lewat tombol **"Lihat invoice A4"**, di halaman `/invoice#kode` yang memakai kode tautan struk. **Staf** mencetak dari tombol **"Cetak invoice A4"** di halaman tagihan final. Draf tidak punya invoice A4. | pemilik (tebakan yang diiyakan) |
| IA9 | Tautan pasien untuk tagihan **dibatalkan** tetap hanya menampilkan pesan, seperti struk sekarang. Cap **DIBATALKAN** muncul pada invoice A4 yang dicetak staf dari panel. | Claude |
| IA10 | Batas "sesaat sesudah final" = waktu entri buku sesi terakhir milik baris invoice itu; bila tidak ada, waktu final invoice. Entri buku sesi lain dihitung bila dibuat sebelum atau pada batas itu. Tidak ada perubahan basis data, sehingga invoice lama ikut mendapat kotak paket. | Claude |
| IA11 | Ukuran A4 portrait, dicetak lewat dialog cetak browser. Panjang tabel mengikuti jumlah baris; cap air diulang di setiap halaman cetak. | Claude |

## 3. Data dan akses

- **Server pasien:** satu aksi server baru membaca invoice A4 dari kode tautan, dengan aturan yang sama seperti `getPublicReceipt`: kode sah, tagihan final, dan tidak dibatalkan. Isinya tanpa harga pokok dan tanpa catatan internal.
- **Panel admin:** memakai `invoice:read`, sama seperti halaman tagihan.
- **Pembacaan bersama:** satu fungsi menyusun data invoice A4 (kop, baris, pembayaran, rekening, paket). Fungsi ini dipakai halaman pasien dan halaman cetak admin.

## 4. Di luar cakupan

- File logo gambar. Belum ada, jadi kop memakai wordmark.
- Mengubah isi pesan WhatsApp struk. Tautannya tetap sama; tombol invoice A4 ada di halaman struk.
- Penjadwalan dan pengingat sesi paket (proyek berikutnya).
