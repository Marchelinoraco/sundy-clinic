# Desain — Dialog paket yang informatif: nilai, biaya, selisih, dan penolakan bila rugi

- **Tanggal:** 21 Oktober 2026
- **Status:** disetujui pemilik lewat tanya-jawab dan contoh tampilan (`.superpowers/brainstorm/…/paket-informatif-v2.html`)
- **Melanjutkan:** `2026-10-21-paket-barang-design.md` (paket berisi barang), `2026-10-21-biaya-lainnya-harga-design.md` (biaya per sesi)

## 1. Tujuan

Pemilik ingin tahu selisih harga paket dengan biaya isinya ketika paket disusun. Paket yang harganya di bawah biaya tidak boleh tersimpan. Dialog paket juga harus menjelaskan setiap kolom, termasuk satuan seperti "sesi" atau "kapsul".

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| PI1 | Setiap isi paket menampilkan harga jual dan biaya per satuan, ditambah **nilai normal** (harga jual × jumlah) dan **biaya** (biaya × jumlah). Untuk treatment, biaya per sesi = total biaya per sesi (bahan + alat + komisi + biaya lainnya). Untuk barang, biaya = **harga beli terakhir**. | pemilik |
| PI2 | Ringkasan dihitung langsung saat mengetik: nilai normal isi, harga paket, **customer hemat** (Rp dan %), total biaya isi, dan **selisih harga paket − biaya** (Rp dan % dari harga paket). | pemilik |
| PI3 | Penyimpanan **ditolak** bila harga paket di bawah total biaya isi. Bila sama, masih boleh. | pemilik |
| PI4 | Penyimpanan **ditolak** bila ada barang yang belum punya harga beli. | pemilik |
| PI5 | Setiap kolom berlabel dan berketerangan. Kolom jumlah menampilkan satuannya ("sesi", "kapsul", "botol", dan seterusnya) beserta batasnya. Tombol "+ Barang" menjadi **"+ Obat / produk"**. | pemilik |
| PI6 | Tabel katalog mendapat kolom **Biaya isi** dan **Selisih**. Paket yang menjadi rugi karena biaya naik belakangan ditandai merah "Biaya naik, perbarui harga", tetapi tidak diblokir, karena aturan hanya diperiksa saat paket disimpan. | pemilik (tebakan yang diiyakan) |
| PI7 | Komisi treatment di dalam paket dihitung dari harga treatment di katalog, sama seperti saat sesi paket dipakai. | pemilik (tebakan yang diiyakan) |
| PI8 | Harga beli terakhir = `unitCost` batch terbaru (menurut waktu dibuat) yang sudah berharga, di cabang mana pun. | Claude |
| PI9 | Mengaktifkan kembali paket yang rugi tidak diblokir. Aturan hanya berlaku saat tambah atau ubah paket. | Claude |
| PI10 | Label "Masa berlaku (hari)" dipertahankan, ditambah keterangan tanggal akhir bila dibeli hari ini. Keterangan paket dijelaskan sebagai catatan internal, karena memang tidak tampil di tagihan maupun struk. | Claude |

## 3. Pesan

- Barang tanpa harga beli: `Harga beli {nama} belum diisi. Isi di Stok → Barang masuk.`
- Harga di bawah biaya: `Harga paket Rp X di bawah total biaya isi Rp Y. Naikkan harga paket atau kurangi isinya.`

Server memeriksa ulang keduanya dengan data dari basis data, tidak dari browser.

## 4. Di luar cakupan

- Perubahan basis data: tidak ada.
- Memblokir perubahan biaya treatment atau harga beli yang membuat paket lama menjadi rugi.
