# Desain — Angka vital oleh perawat dan paket di resep dokter

- **Tanggal:** 22 Oktober 2026
- **Status:** menunggu persetujuan pemilik
- **Melanjutkan:** peran perawat (halaman Tangani), catatan dokter (bagian O), resep dokter, paket treatment

## 1. Tujuan

Saat dokter mulai memeriksa, angka vital pasien seharusnya sudah tersedia. Perawat yang mengukurnya, dan namanya tercatat. Dokter juga ingin menyarankan paket langsung dari catatan kunjungan, sama seperti treatment dan obat, supaya paket itu sudah ada di tagihan.

**Berhasil bila:**
- perawat mengisi angka vital di halaman Tangani, dan bagian O dokter sudah terisi saat dokter menekan Periksa;
- dokter tidak bisa memeriksa pasien klinik sebelum perawat menekan Selesai ditangani;
- nama perawat yang menangani tercatat dari akunnya;
- paket pilihan dokter langsung menjadi baris paket di tagihan; bila tidak jadi dibeli, alasannya terlihat oleh dokter.

**Gagal walau jalan bila:**
- angka dari perawat hilang atau tertimpa tanpa diketahui;
- dokter tidak bisa memeriksa konsultasi online karena menunggu perawat;
- paket yang ditolak pasien hilang dari tagihan tanpa jejak.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| VP1 | Halaman **Tangani** perawat mendapat bagian **Angka vital** (di atas Food recall), berisi isian yang sama dengan bagian O dokter: Sistolik, Diastolik, Nadi, Suhu, Berat badan, Tinggi badan, Lingkar pinggang/perut. Batas angka sama dengan formulir dokter. | pemilik |
| VP2 | **Tinggi badan** terisi dari kunjungan terakhir pasien. Isian tersimpan otomatis saat diketik. Tidak ada angka yang wajib. | pemilik (tebakan yang diiyakan) |
| VP3 | Tombol **Selesai ditangani** mengunci angka vital di halaman perawat. Sebelum ditekan, perawat bebas mengubahnya. | pemilik |
| VP4 | **Dokter tidak bisa menekan Periksa** untuk pasien klinik selama perawat belum menekan Selesai ditangani. Tombol nonaktif dengan keterangan "Menunggu perawat"; server juga menolak dengan "Perawat belum selesai menangani pasien ini." **Konsultasi online tidak melewati perawat.** Kunjungan yang sudah dibuka dokter sebelum fitur ini tidak terpengaruh. | pemilik; online & kunjungan lama: Claude |
| VP5 | Saat dokter menekan Periksa, angka dari perawat **disalin ke bagian O**. Dokter boleh mengubahnya; angka terakhir yang tersimpan dipakai. | pemilik |
| VP6 | **Nama perawat dari akunnya** dicatat bersama waktunya: halaman Tangani menampilkan "Ditangani {nama} · {jam}", dan bagian O dokter serta catatan finalnya menampilkan "Diukur perawat {nama} · {jam}". Bila dokter mengubah angka mana pun, ditambah "· diubah dokter". | pemilik; "diubah dokter": Claude |
| VP7 | Perawat selalu bertugas setiap hari; tidak ada jalan pintas untuk melewati Tangani. | pemilik |
| PR1 | Di bagian **Resep**, dokter bisa **Tambah paket** dari katalog yang masih dijual. Dokter melihat nama dan isi paket (mis. "4× Facial, 28 kapsul Slimming"), **tanpa harga**. Paket tercatat di catatan kunjungan dan terkunci saat final. | pemilik; tanpa harga: Claude |
| PR2 | **Buat tagihan** dari kunjungan menambahkan setiap paket pilihan dokter sebagai baris paket dengan harga katalog saat itu, bersama treatment dan obat. Sesi atau obatnya bisa langsung dipakai di tagihan yang sama ("dibeli di tagihan ini"). | pemilik |
| PR3 | **Tidak jadi dibeli**: resepsionis menghapus baris paket dari dokter hanya dengan **alasan** (2–200 karakter). Alasan disimpan terpisah dari catatan dokter yang terkunci; dokter melihat "Tidak dibeli — {alasan}" di catatannya. Selama tagihan masih draf, resepsionis bisa **mengembalikan** baris itu. | pemilik; kembalikan: Claude (sama seperti obat resep) |
| PR4 | Paket dari dokter bisa ditambahkan lebih dari satu, tetapi paket yang sama tidak dua kali dalam satu kunjungan. | Claude |

## 3. Data (migrasi hanya menambah)

- Angka vital perawat per kunjungan (booking): tujuh angka, nama dan id perawat yang terakhir mengisi, waktu Selesai ditangani beserta nama perawatnya. Tersimpan terpisah dari catatan dokter, karena catatan dokter baru ada setelah Periksa.
- Paket pilihan dokter per catatan kunjungan: paket katalog, nama paket dan ringkasan isinya (disalin), urutan. Terkunci saat kunjungan final, seperti resep.
- Keputusan resepsionis atas paket dari dokter: alasan tidak dibeli, nama resepsionis, waktu; terhubung ke baris tagihannya.

## 4. Alur

1. **Check-in** seperti sekarang; pasien muncul di daftar perawat.
2. **Perawat → Tangani:** isi Angka vital (tersimpan otomatis), food recall dan BIA seperti biasa, lalu **Selesai ditangani**.
3. **Dokter → Pasien hari ini:** Periksa aktif setelah perawat selesai. Bagian O terisi, dengan keterangan "Diukur perawat {nama} · {jam}".
4. **Dokter → Resep:** Tambah obat dan/atau **Tambah paket**. Finalisasi seperti biasa.
5. **Resepsionis → Buat tagihan:** treatment, obat, dan paket pilihan dokter sudah ada. Pelaksana treatment dipilih seperti sekarang. Paket yang ditolak pasien dihapus dengan alasan, atau dikembalikan bila berubah pikiran.
6. **Catatan dokter (riwayat):** paket tampil dengan keterangan "Tidak dibeli — {alasan}" bila dihapus resepsionis.

## 5. Di luar cakupan

- Perawat mengisi bagian lain dari catatan dokter (S, A, P).
- Mengunci angka vital setelah dokter mulai memeriksa di luar aturan VP5.
- Harga paket khusus dari dokter; harga selalu harga katalog.
- Rilis dan buku panduan: dikerjakan saat rilis.
