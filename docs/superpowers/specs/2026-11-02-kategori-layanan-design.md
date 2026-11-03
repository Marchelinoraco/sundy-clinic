# Desain — Kelola kategori layanan

- **Tanggal:** 2 November 2026
- **Status:** gambaran disetujui pemilik di chat ("ok sudah sesuai", "admin bisa unggah foto kategori dan foto treatment", lalu "ok sudah sesuai" untuk sakelar per kategori dan label paket); dokumen ini menunggu persetujuan
- **Melanjutkan:** menu Layanan & Harga (tab Layanan internal dan Layanan situs), halaman /layanan situs publik, booking situs /daftar, dialog paket

## 1. Tujuan

Pemilik ingin kategori layanan bisa ditambah, diubah, dan dihapus sendiri oleh admin (CRUD), supaya katalog bisa tumbuh
tanpa menunggu programmer. Belum ada kategori baru tertentu yang menunggu; fitur ini untuk ke depan.

Pemilik juga menegaskan bahwa **tidak semua layanan adalah treatment**. Contohnya jasa konsultasi, yang ingin dimasukkan ke
paket bersama treatment dan obat/produk. Secara teknis, isi paket sudah bisa diambil dari layanan internal mana pun yang aktif
(termasuk Konsultasi Dokter, Timbang BIA, Meal Plan). Namun dialog paket menyebut semuanya "Treatment", dan booking situs
menganggap layanan di kategori mana pun selain Slimming sebagai treatment yang boleh dipesan sendiri oleh pasien.

Keadaan sekarang: 11 kategori (Facial Treatment … Slimming & Wellness) dibuat sekali oleh seed (`prisma/seed.ts`). Admin
hanya bisa memilih kategori yang ada saat menambah layanan; tidak ada cara menambah, mengganti nama, mengurutkan, atau
menghapus kategori.

**Berhasil bila:**
- admin menambah kategori baru lalu langsung memakainya untuk layanan internal dan layanan situs;
- nama, deskripsi, urutan, dan foto kategori bisa diubah dan perubahannya segera terlihat di admin dan situs;
- kategori yang tidak dipakai lagi bisa dihapus;
- admin bisa membuat kategori untuk layanan yang bukan treatment (misalnya "Konsultasi & Jasa"), yang tidak ditawarkan untuk
  dipesan sendiri oleh pasien di situs tetapi tetap bisa masuk paket dan tagihan.

**Gagal walau jalan bila:**
- menghapus kategori ikut menghapus layanan, layanan situs, atau apa pun yang tertaut ke layanan itu (saat ini relasi
  kategori → layanan dan kategori → layanan situs memakai hapus berantai);
- mengganti nama kategori merusak tautan lama ke bagian kategori di situs (`/layanan#…`);
- layanan Slimming, atau jasa yang bukan treatment, bisa dipilih sendiri oleh pasien lama Aesthetic di /daftar;
- kategori baru tanpa foto membuat kartu layanan di situs tampil kosong atau rusak.

## 2. Keputusan

| # | Keputusan | Asal |
|---|-----------|------|
| KL1 | Yang boleh mengelola kategori: yang sudah boleh mengelola Layanan & Harga (`catalog:manage`: Admin Keuangan, Super Admin). Server memeriksa hak ini di setiap aksi. | Claude, diiyakan |
| KL2 | Tombol **Kelola kategori** di kepala halaman Layanan & Harga, tampil di kedua tab, di samping tombol tambah layanan. Tombol membuka dialog berisi **semua** kategori menurut urutan: foto kecil, nama, jumlah layanan internal dan layanan situs di dalamnya, tanda "Tidak dipesan sendiri" bila sakelar KL14 mati, tombol naik/turun, **Ubah**, **Hapus**; serta tombol **+ Kategori**. | Claude, diiyakan (letak); isi daftar: Claude |
| KL3 | Isi kategori: **nama** (wajib, unik tanpa membedakan huruf besar-kecil, paling banyak 60 karakter), **deskripsi** (opsional, paling banyak 200 karakter), **foto** (opsional, KL9), dan **sakelar KL14**. Deskripsi tampil di bawah judul kategori di /layanan seperti sekarang. | pemilik, diiyakan; batas panjang: Claude |
| KL4 | **Urutan** diatur dengan tombol naik/turun di daftar KL2. Kategori baru ditaruh paling bawah. Urutan ini sudah dipakai di semua tempat yang mengurutkan menurut kategori: tombol kategori dan tabel di Layanan & Harga, halaman /layanan, pilihan layanan di Booking Baru, booking situs, pemeriksaan, dan dialog paket. | pemilik, diiyakan; naik/turun dan posisi kategori baru: Claude |
| KL5 | **Alamat kategori** (slug, dipakai untuk tautan `/layanan#…`) dibuat sekali dari nama saat kategori ditambah, lalu **tidak berubah** walau nama diganti. Bila bentrok dengan slug yang ada, diberi akhiran (`-2`, `-3`, …). Admin tidak melihat dan tidak mengubah slug. | Claude, diiyakan |
| KL6 | **Hapus** hanya bila kategori **kosong**: tidak berisi layanan internal (termasuk yang nonaktif) maupun layanan situs (termasuk yang tersembunyi). Bila masih berisi, hapus ditolak dengan pesan "Kategori ini masih berisi {X} layanan internal dan {Y} layanan situs. Pindahkan dulu ke kategori lain lewat tombol Ubah pada layanannya." Hapus meminta konfirmasi di dalam dialog. Foto unggahan kategori ikut dihapus. | pemilik, diiyakan |
| KL7 | Sebagai pengaman kedua, relasi kategori → layanan internal dan kategori → layanan situs di database diubah dari **hapus berantai** menjadi **tolak hapus** (Restrict). | Claude |
| KL8 | **Slimming & Wellness tidak bisa dihapus:** tombol Hapus tidak tampil dan server menolak. Kategori ini berisi Konsultasi Online, yang tidak tampil di tabel layanan dan tidak bisa dipindah admin, sehingga kategorinya tidak akan pernah kosong. Nama, deskripsi, foto, urutan, dan sakelar KL14 tetap boleh diubah. | Claude, diiyakan |
| KL9 | **Foto kategori** diunggah dari dialog Ubah kategori, dengan cara dan batas yang sama seperti foto layanan situs: paling besar 8 MB, diproses menjadi WebP, bisa diganti dan dihapus. Foto ini dipakai sebagai foto kartu layanan situs di kategori itu yang **belum punya foto sendiri**. Urutan foto kartu: (1) foto layanan situs → (2) foto kategori unggahan → (3) foto bawaan kategori lama (11 foto di `src/lib/site-images.ts`) → (4) foto umum klinik. Menghapus foto unggahan mengembalikan kartu ke foto bawaan atau foto umum. Foto unggahan kategori hanya disajikan ke publik untuk kategori yang tercatat memakainya, seperti foto layanan situs. | pemilik (unggah foto kategori); urutan foto dan aturan penyajian: Claude |
| KL10 | **Foto treatment** (foto per layanan situs) **sudah ada**: tab Layanan situs → Ubah → unggah foto. Tidak diubah oleh fitur ini. | pemilik memintanya; sudah tersedia |
| KL11 | Kategori baru **langsung** muncul di pilihan Kategori pada dialog layanan internal dan layanan situs, dan layanannya langsung bisa dipilih di dialog paket. Kategori yang belum berisi layanan tetap tidak tampil di tombol kategori dan tabel Layanan & Harga, maupun di situs (sama seperti sekarang); kategori itu hanya terlihat di daftar Kelola kategori. | Claude |
| KL12 | Setiap tambah, ubah, ubah urutan, hapus, ganti atau hapus foto kategori, dan ubah sakelar KL14 **tercatat di audit** (siapa, kapan, apa). Halaman situs yang terdampak diperbarui saat itu juga (revalidate), seperti saat layanan situs diubah. | Claude |
| KL13 | **Seed** tidak lagi menimpa nama, deskripsi, urutan, dan sakelar kategori yang sudah ada; seed hanya membuat kategori yang belum ada (seperti perlakuan Konsultasi Online sekarang). Seed hanya dipakai di komputer pengembang: deploy server hanya menjalankan `prisma migrate deploy` (`scripts/server/deploy.sh`), jadi perubahan admin di server tidak tersentuh seed. Seed tetap boleh mengembalikan kategori layanan bawaan di database lokal. | Claude (temuan reviewer) |
| KL14 | Sakelar per kategori **"Pasien boleh memilih sendiri di situs"**. Bila **mati**, layanan situs di kategori itu tidak ditawarkan sebagai treatment saat pasien lama Aesthetic booking sendiri di /daftar, dan server menolaknya bila dikirim juga, dengan pesan yang sama seperti sekarang ("Silakan pilih Konsultasi Dokter. Treatment ditentukan dokter setelah pemeriksaan."). Layanannya tetap tampil di /layanan, dan tetap bisa dipakai di Booking Baru oleh staf, tagihan, resep dokter, serta paket. Nilai awal: **hidup** untuk kategori baru dan 10 kategori lama; **mati** untuk Slimming & Wellness. Sakelar ini **menggantikan** aturan Slimming yang sekarang ditulis tetap berdasarkan slug (`SLIMMING_CATEGORY_SLUG` di `src/server/public-booking-data.ts` dan `src/server/public-booking.ts`). Konsultasi Dokter tetap selalu ditawarkan di /daftar, di kategori mana pun. | pemilik ("tidak semua treatment …", "ok sudah sesuai"); nilai awal: Claude, diiyakan |
| KL15 | **Dialog paket memakai kata "Layanan", bukan "Treatment":** tombol "+ Treatment" menjadi **"+ Layanan"**, label kolom isi "Treatment" menjadi **"Layanan"**, dan catatan "biaya treatment + harga beli barang" menjadi "biaya layanan + harga beli barang". Pesan galat dan label aksesibilitas di dialog ini ikut disesuaikan. "+ Obat / produk" tidak berubah. Tampilan paket di tempat lain (invoice, progres paket) tidak diubah. | pemilik ("ok sudah sesuai") |

Contoh 1: admin menambah kategori "Hair Treatment" dengan deskripsi "Perawatan rambut dan kulit kepala", mengunggah foto,
menaikkannya ke bawah Peeling, lalu menambah layanan internal "PRP Rambut" dan layanan situs untuknya di kategori itu.
Kartu "PRP Rambut" di /layanan memakai foto kategori sampai layanan situs itu diberi foto sendiri.

Contoh 2: admin menambah kategori "Konsultasi & Jasa" dengan sakelar KL14 **mati**, menambah layanan internal "Jasa Konsultasi
Gizi", dan memindahkan Timbang BIA dan Meal Plan ke sana. Di dialog paket, admin menekan "+ Layanan" dan memilih "Jasa
Konsultasi Gizi" di bawah kelompok "Konsultasi & Jasa". Pasien lama Aesthetic tidak melihat layanan kategori ini sebagai
pilihan treatment di /daftar.

## 3. Data

- **Kategori layanan:** tambah kolom foto (kosong = tidak ada foto unggahan) dan kolom sakelar KL14 (nilai awal hidup).
  Migrasi mematikan sakelar untuk kategori ber-slug `slimming`. Tambah aturan unik nama tanpa membedakan huruf besar-kecil
  (indeks atas nama huruf kecil, seperti kategori pengeluaran).
- **Relasi** layanan internal → kategori dan layanan situs → kategori: hapus berantai diganti tolak hapus (KL7).
- Tidak ada data yang dipindah atau dihapus. 11 kategori yang ada tetap dengan slug, nama, dan urutannya.

## 4. Alur

1. Admin membuka Layanan & Harga → **Kelola kategori** → **+ Kategori** → isi nama (dan deskripsi bila perlu), atur sakelar
   KL14 → Simpan. Kategori muncul paling bawah di daftar.
2. **Ubah** pada kategori itu → unggah foto (opsional) → Simpan.
3. Admin menambah layanan internal atau layanan situs dan memilih kategori baru di kolom Kategori.
4. Admin mengatur posisi kategori dengan naik/turun. Situs dan admin mengikuti urutan baru.
5. Di Paket, admin menambah isi paket lewat **+ Layanan** (treatment maupun jasa) dan **+ Obat / produk**.
6. Untuk menghapus: admin memindahkan setiap layanan internal dan layanan situs ke kategori lain lewat dialog Ubah
   layanannya, lalu menekan Hapus pada kategori dan mengonfirmasi.

## 5. Diserahkan ke pembangun

- Tampilan persis dialog Kelola kategori dan dialog Tambah/Ubah kategori, termasuk teks bantuan di bawah sakelar KL14. Ikuti
  pola Material UI di admin, misalnya pengelola kategori pengeluaran (`src/components/admin/expenses/category-manager.tsx`) dan
  dialog layanan situs.
- Aturan pembentukan slug dari nama: huruf kecil, tanda hubung, buang karakter lain, serta slug cadangan bila nama tidak
  menghasilkan huruf apa pun.
- Rute publik untuk foto kategori: rute baru (misalnya `/foto-kategori/<nama>`) atau perluasan rute foto yang sudah ada,
  dengan aturan penyajian KL9.
- Teks alternatif foto kategori unggahan (misalnya nama kategori).
- Cara menyimpan perubahan urutan (tukar dua nilai atau tulis ulang semua urutan).
- Apakah konstanta `SLIMMING_CATEGORY_SLUG` dihapus setelah diganti sakelar KL14.

## 6. Di luar cakupan

- Memindahkan semua layanan sekaligus dari satu kategori ke kategori lain.
- Menonaktifkan atau menyembunyikan kategori. Setiap layanan sudah punya status aktif/tersembunyi sendiri.
- Menampilkan foto kategori sebagai gambar judul bagian kategori di situs. Foto kategori hanya dipakai sebagai foto kartu (KL9).
- Subkategori atau kategori bertingkat.
- Kategori untuk paket, obat, atau produk.
- Mengganti kata "treatment" di luar dialog paket (invoice, progres paket, pengingat treatment).
- Rilis dan buku panduan: dikerjakan saat rilis.
