# Desain — Deposit booking dan saldo deposit pasien

- **Tanggal:** 23 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Melanjutkan:** biaya booking (verifikasi transfer), tagihan dan pembayaran, struk, invoice A4
- **Proyek 2 dari 2.** Bergantung pada proyek 1, PIN persetujuan (`2026-10-23-pin-persetujuan-design.md`).

## 1. Tujuan

Biaya booking yang sudah ditransfer pasien tidak lagi menjadi biaya terpisah. Biaya itu menjadi **deposit** yang
memotong tagihan kunjungannya. Kelebihan bayar non-tunai, dan sisa deposit booking yang lebih besar dari tagihan,
menjadi **saldo deposit pasien**. Saldo itu dipotong otomatis dari tagihan berikutnya dan hangus setelah 30 hari.

**Berhasil bila:**
- tagihan kunjungan menampilkan baris deposit, dan pasien hanya membayar sisanya;
- kelebihan transfer/QRIS/EDC tidak ditolak, tetapi tercatat sebagai saldo deposit pasien dengan tanggal berlakunya;
- saldo deposit terpotong sendiri di tagihan berikutnya pasien itu;
- laporan uang masuk tidak menghitung uang yang sama dua kali.

**Gagal walau jalan bila:**
- deposit terpotong dari tagihan padahal transfernya belum pernah diverifikasi;
- saldo deposit bisa dipakai dua kali, atau hilang tanpa jejak saat tagihan atau pembayaran dibatalkan;
- uang yang sama muncul dua kali di laporan.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| D1 | Biaya booking menjadi **Deposit booking**. Pada tagihan kunjungan dari booking itu, total dipotong sebesar biaya booking. | pemilik |
| D2 | Bila pasien batal atau tidak hadir, deposit booking **hangus**, seperti sekarang. | pemilik |
| D3 | Deposit booking hanya dipotong bila transfer booking itu **sudah diverifikasi**. Booking walk-in (tanpa biaya booking) dan booking yang tidak pernah diverifikasi tidak punya deposit. | Claude |
| D3b | **Konsultasi online:** bagian biaya booking dari pembayaran di depan juga menjadi deposit booking bagi tagihan kunjungan online itu, misalnya obat. Harga konsultasinya tetap tidak ditagih lagi, seperti sekarang. | Claude |
| D4 | Bila tagihan lebih kecil dari deposit booking, tagihan **Lunas** dan kelebihannya menjadi **saldo deposit pasien**, berlaku 30 hari. | pemilik |
| D5 | **Kelebihan bayar non-tunai** (Transfer, QRIS, EDC) diterima. Tagihan menjadi Lunas, dan kelebihannya menjadi saldo deposit pasien. Pembayaran **tunai** tetap tidak boleh melebihi sisa; kembaliannya diberikan di kasir. | pemilik; tunai: Claude |
| D6 | Saldo deposit pasien **dipotong otomatis** dari tagihan berikutnya pasien itu (kunjungan maupun penjualan langsung), sampai saldo habis atau tagihan tertutup. Saldo yang paling dulu kedaluwarsa dipakai lebih dulu. | pemilik; urutan: Claude |
| D7 | Saldo deposit berlaku **30 hari** sejak dicatat (tanggal pembayaran yang berlebih, atau tanggal tagihan difinalkan untuk sisa deposit booking). "Berlaku s.d." = tanggal dicatat + 30 hari, masih bisa dipakai pada tanggal itu. Sehari sesudahnya **hangus**. | pemilik; tanggal pasti: Claude |
| D8 | Potongan dihitung saat **tagihan difinalkan**. Selama draf, rincian sudah menampilkan perkiraan potongannya. Tagihan yang tertutup penuh oleh deposit langsung Lunas tanpa pembayaran di kasir. | Claude |
| D9 | Rincian tagihan (draf, final, struk, invoice A4): Subtotal, Diskon, Total, lalu baris **Deposit booking −Rp …** dan/atau **Saldo deposit −Rp …**, lalu **Sisa tagihan**. Bila ada kelebihan bayar: "Kelebihan Rp … menjadi deposit, berlaku s.d. {tanggal}". | Claude |
| D10 | Halaman **Pasien** menampilkan saldo deposit yang masih berlaku beserta tanggal kedaluwarsanya. | Claude |
| D11 | **Laporan tetap berbasis uang masuk.** Biaya booking dihitung saat diverifikasi, seperti sekarang. Pembayaran di kasir dihitung saat diterima, termasuk kelebihannya. Pemakaian deposit dan deposit yang hangus tidak dihitung lagi. | Claude |
| D12 | **Pembatalan:** membatalkan tagihan mengembalikan deposit yang dipakainya ke pasien dengan tanggal berlaku aslinya. Deposit yang lahir dari tagihan itu ikut dihapus bila belum dipakai. Bila sudah dipakai tagihan lain, pembatalan ditolak dan pesannya menyebut tagihan itu. Membatalkan pembayaran yang berlebih mengikuti aturan yang sama untuk deposit yang lahir darinya. | Claude |
| D14 | **Diskon sesudah final** tetap tidak boleh membuat total di bawah yang sudah tertutup. Yang tertutup kini = pembayaran + deposit yang dipakai. | Claude |
| D15 | **Pengembalian deposit dalam bentuk uang:** resepsionis menekan **Kembalikan uang** di halaman pasien atau di daftar deposit. Isiannya: jumlah, cara (tunai atau transfer), dan alasan. Tindakan ini wajib PIN persetujuan Admin Keuangan atau Super Admin (proyek 1, P1d), juga bila mereka sendiri yang mengembalikan. | pemilik |
| D16 | Pengembalian hanya untuk **saldo yang masih berlaku Rp 200.000 ke atas**. Jumlah yang dikembalikan minimal Rp 200.000 dan paling banyak sebesar saldo itu. Saldo yang paling dulu kedaluwarsa dipotong lebih dulu. | pemilik; urutan: Claude |
| D17 | Di laporan, pengembalian dihitung sebagai **uang keluar** pada tanggal pengembalian, sehingga pemasukan periode itu berkurang. | Claude |
| D18 | **Daftar deposit semua pasien:** menu **Deposit** untuk Resepsionis, Admin Keuangan, dan Super Admin. Tab **Aktif** berisi pasien dengan saldo yang masih berlaku: total saldo, kedaluwarsa terdekat, dan tombol Kembalikan uang. Tab **Riwayat** berisi semua gerakan: masuk (deposit booking, kelebihan bayar, sisa deposit booking), dipakai, dikembalikan, dan hangus, dengan tanggal, tagihan, staf, dan penyetuju. | pemilik; isi: Claude |
| D13 | Teks lama diganti: pesan WA konfirmasi ("biaya booking tetap berlaku…tidak dikembalikan") dan buku panduan ("terpisah dari biaya layanan") menjadi "biaya booking menjadi deposit yang dipotong dari tagihan; hangus bila batal atau tidak hadir". | Claude |
| D19 | **Saldo kelebihan bayar yang hangus dihitung pendapatan** pada tanggal hangusnya (sehari sesudah "berlaku s.d."), sebesar sisa yang belum dipakai atau dikembalikan, di cabang tagihan asalnya. Laporan menulisnya sebagai "Saldo deposit hangus". Sisa deposit booking yang hangus tidak ditambahkan lagi, karena biaya bookingnya sudah dihitung saat diverifikasi. | pemilik (24 Okt 2026); rincian: Claude |

## 3. Data (migrasi hanya menambah)

- **Catatan deposit pasien:** pasien, jumlah, asal (pembayaran berlebih atau sisa deposit booking, dengan tagihan dan pembayaran asalnya), tanggal dicatat, dan tanggal berlaku sampai.
- **Pengembalian deposit:** pasien, jumlah, cara, alasan, staf, dan penyetuju; mengurangi saldo yang masih berlaku.
- **Pemakaian deposit:** tagihan, deposit yang dipakai (booking atau saldo pasien), dan jumlahnya. Dicatat saat tagihan difinalkan, dihapus saat tagihan dibatalkan.
- Sisa tagihan dan status bayar (Belum dibayar / Deposit / Lunas) memperhitungkan pemakaian deposit.

## 4. Alur

1. **Booking → verifikasi transfer:** seperti sekarang. Laporan menghitung biaya booking saat diverifikasi.
2. **Buat tagihan kunjungan:** draf menampilkan perkiraan "Deposit booking −Rp 100.000" dan saldo deposit pasien yang berlaku, lalu Sisa tagihan.
3. **Finalkan:** potongan dicatat. Bila sisa Rp 0, tagihan langsung Lunas. Bila deposit booking melebihi total, kelebihannya menjadi saldo deposit pasien (30 hari).
4. **Catat pembayaran:** nominal bawaan = sisa. Tunai tidak boleh melebihi sisa. Non-tunai yang berlebih membuat tagihan Lunas dan mencatat saldo deposit pasien.
5. **Tagihan berikutnya:** saldo yang masih berlaku dipotong otomatis.

## 5. Di luar cakupan

- Memindahkan deposit antar pasien.
- Pengembalian deposit booking yang hangus (D2).
- Rilis dan buku panduan: dikerjakan saat rilis.
