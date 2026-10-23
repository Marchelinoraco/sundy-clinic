# Desain — PIN persetujuan

- **Tanggal:** 23 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Proyek 1 dari 2.** Proyek 2 adalah deposit (`2026-10-23-deposit-design.md`), yang memakai PIN ini untuk pengembalian deposit dalam bentuk uang.

## 1. Tujuan

Tindakan yang mengurangi uang klinik di tagihan harus disetujui Admin Keuangan atau Super Admin di tempat, saat itu juga,
dengan PIN mereka. Nama penyetuju tercatat.

**Berhasil bila:**
- mengubah harga, memberi diskon, dan membatalkan tagihan tidak bisa disimpan tanpa PIN penyetuju yang benar;
- nama penyetuju terlihat di tagihan dan di riwayat aktivitas;
- PIN tidak bisa ditebak dengan mencoba berulang kali.

**Gagal walau jalan bila:**
- PIN bisa dilewati lewat jalan lain, misalnya memanggil server langsung tanpa PIN;
- kata sandi login penyetuju harus diketik di komputer kasir;
- penyetuju yang lupa PIN tidak punya jalan keluar.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| P1 | Tindakan yang **wajib PIN** Admin Keuangan atau Super Admin: (a) mengubah harga baris dari harga katalog, (b) diskon baris atau diskon tagihan, (c) membatalkan tagihan, (d) mengembalikan deposit dalam bentuk uang (proyek 2). | pemilik |
| P2 | PIN wajib **siapa pun yang melakukan tindakannya**, termasuk Admin Keuangan dan Super Admin sendiri. Mereka memasukkan PIN mereka sendiri. | pemilik |
| P3 | **Batas diskon resepsionis 20% tetap berlaku**, walau dengan PIN. Diskon di atas 20% tetap dikerjakan Admin Keuangan, juga dengan PIN. Termasuk diskon sesudah final. | pemilik; sesudah final: Claude |
| P4 | **Batalkan pembayaran** tetap hanya Admin Keuangan, tanpa PIN, seperti sekarang. **Buang draf** tetap tanpa PIN. | pemilik |
| P5 | Tidak perlu PIN: mengembalikan harga ke harga katalog, **Segarkan harga katalog**, dan menghapus diskon, karena semuanya tidak mengurangi uang. | Claude |
| P6 | Alasan tetap wajib seperti sekarang: alasan harga, alasan diskon, dan alasan pembatalan. PIN tidak menggantikannya. | Claude |
| P7 | **Kotak Persetujuan** muncul saat tindakan disimpan. Penyetuju memilih namanya dari daftar Admin Keuangan dan Super Admin aktif yang sudah punya PIN, lalu mengetik PIN. Server memeriksa PIN di tindakan itu sendiri; tanpa PIN yang benar, tindakan ditolak. | Claude |
| P8 | **Membuat dan mengganti PIN:** Admin Keuangan dan Super Admin membuat PIN **6 angka** lewat menu akun (kanan atas), di tempat yang sama dengan Ganti kata sandi. Mengganti PIN meminta PIN lama. PIN disimpan teracak, sama seperti kata sandi. | pemilik (PIN); 6 angka dan tempat: Claude |
| P9 | **Keamanan:** 5 kali PIN salah berturut-turut mengunci PIN orang itu selama **15 menit**. Pesannya menyebut sampai jam berapa. | Claude |
| P10 | **Lupa PIN:** Super Admin menekan **Reset PIN** pada staf itu di menu Staf. PIN-nya terhapus, dan orang itu membuat PIN baru sendiri. | Claude |
| P11 | **Jejak:** nama penyetuju dicatat di riwayat aktivitas setiap tindakan. Di tagihan tampil kecil, misalnya "Diskon 10% · disetujui Rina" dan "Harga diubah · disetujui Rina". Tagihan batal menampilkan "Dibatalkan … · disetujui Rina". | Claude |
| P13 | **Baris bebas** (+ Baris layanan → Lainnya): menambahnya dan mengubah harganya wajib PIN, karena harganya di luar katalog. Mengubah jumlah saja tidak. Tagihan menulis "Baris bebas · disetujui {nama}". Menutup jalan pintas menghapus baris katalog lalu menambahkannya lagi lebih murah (temuan review). | pemilik (pilihan A, 24 Okt 2026) |
| P12 | Bila belum ada satu pun penyetuju yang punya PIN, kotak Persetujuan memberi tahu: "Belum ada Admin Keuangan atau Super Admin yang membuat PIN." | Claude |

## 3. Data (migrasi hanya menambah)

- **PIN per staf:** hash PIN, jumlah salah berturut-turut, dan terkunci sampai jam berapa. Hanya untuk Admin Keuangan dan Super Admin.
- **Penyetuju pada tindakan:** nama dan id penyetuju disimpan bersama harga baris, diskon (baris dan tagihan), dan pembatalan tagihan. Juga dicatat di riwayat aktivitas.

## 4. Alur

1. Admin Keuangan atau Super Admin membuka menu akun → **PIN persetujuan** → membuat PIN 6 angka.
2. Resepsionis mengubah harga atau memberi diskon di draf tagihan → **Simpan** → kotak Persetujuan → penyetuju memilih nama dan mengetik PIN → tersimpan dengan nama penyetuju.
3. Resepsionis membatalkan tagihan → isi alasan → kotak Persetujuan → dibatalkan.
4. PIN salah 5 kali → terkunci 15 menit. Lupa PIN → Super Admin menekan Reset PIN di menu Staf.

## 5. Di luar cakupan

- Persetujuan jarak jauh, misalnya penyetuju menyetujui dari HP-nya sendiri.
- PIN untuk tindakan lain di luar P1.
- Rilis dan buku panduan: dikerjakan saat rilis.
