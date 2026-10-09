#!/usr/bin/env bash
# Uji pemulihan (sekali setelah pemasangan, lalu bulanan). Jalankan sebagai root:
#   /www/sundy/current/scripts/server/restore-test.sh [YYYY-MM-DD]   # bawaan: backup terbaru
# Mengunduh backup terenkripsi, memulihkannya ke database sementara, memeriksa arsip file,
# lalu menampilkan jumlah baris per tabel berdampingan dengan database aktif. Selisih kecil
# wajar (data sejak jam backup); tabel yang hilang atau kosong mendadak tidak wajar.
set -euo pipefail

REMOTE=${SUNDY_REMOTE:-sundy-crypt:}
DB=${SUNDY_DB:-sundy}
UJI=${DB}_uji_pulih
SQL=$(cd "$(dirname "$0")" && pwd)/hitung-baris.sql
TGL=${1:-$(rclone lsf --dirs-only "${REMOTE}harian" | sed 's#/$##' | sort | tail -n 1)}
KERJA=$(mktemp -d)
trap 'rm -rf "$KERJA"; sudo -u postgres dropdb --if-exists "$UJI"' EXIT

echo "Mengunduh backup $TGL…"
rclone copy "${REMOTE}harian/$TGL" "$KERJA"
tar -tzf "$KERJA/file-pasien.tar.gz" > /dev/null
tar -tzf "$KERJA/konfigurasi.tar.gz" > /dev/null
chmod 755 "$KERJA" && chmod 644 "$KERJA/$DB.dump" # agar user postgres bisa membaca

sudo -u postgres dropdb --if-exists "$UJI"
sudo -u postgres createdb "$UJI"
sudo -u postgres pg_restore --no-owner --no-acl --exit-on-error --dbname "$UJI" "$KERJA/$DB.dump"

# Hasil BIA (spec hasil BIA 9): satu berkas yang tercatat di backup harus ada di arsip file dengan sidik jari yang sama.
FILES_DIR=${PATIENT_FILES_DIR:-/www/sundy-files}
CONTOH=$(printf '%s\n' 'SELECT "storageName" || chr(124) || "sha256" FROM "BiaFile" ORDER BY "uploadedAt" LIMIT 1;' \
  | sudo -u postgres psql -At -d "$UJI" 2>/dev/null || true)
if [ -n "$CONTOH" ]; then
  NAMA=${CONTOH%%|*}
  SIDIK=${CONTOH##*|}
  HASIL=$(tar -xzOf "$KERJA/file-pasien.tar.gz" "$(basename "$FILES_DIR")/bia/$NAMA" | sha256sum | cut -d' ' -f1)
  if [ "$HASIL" != "$SIDIK" ]; then
    echo "GAGAL: berkas BIA $NAMA di arsip tidak sama dengan catatan database." >&2
    exit 1
  fi
  echo "Berkas BIA contoh utuh: $NAMA"
else
  echo "Belum ada berkas BIA di backup ini; pemeriksaan berkas BIA dilewati."
fi

# SQL dialirkan lewat stdin: skrip ini berjalan sebagai root, tetapi psql berjalan sebagai
# postgres yang tidak boleh membaca folder rilis milik sundyapp.
hitung() { sudo -u postgres psql -At -d "$1" < "$SQL" | LC_ALL=C sort; }
hitung "$UJI" > "$KERJA/pulih.txt"
hitung "$DB" > "$KERJA/aktif.txt"

echo "tabel|pulih|aktif"
LC_ALL=C join -t '|' -a1 -a2 -e '-' -o 0,1.2,2.2 "$KERJA/pulih.txt" "$KERJA/aktif.txt"

jumlah_pulih=$(wc -l < "$KERJA/pulih.txt")
jumlah_aktif=$(wc -l < "$KERJA/aktif.txt")
if [ "$jumlah_pulih" -ne "$jumlah_aktif" ]; then
  echo "GAGAL: backup berisi $jumlah_pulih tabel, database aktif $jumlah_aktif." >&2
  exit 1
fi
echo "PULIH OK: backup $TGL berhasil dipulihkan ($jumlah_pulih tabel, arsip file & konfigurasi utuh)."
