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

echo "tabel|pulih|aktif"
join -t '|' -a1 -a2 -e '-' -o 0,1.2,2.2 \
  <(sudo -u postgres psql -At -d "$UJI" -f "$SQL") \
  <(sudo -u postgres psql -At -d "$DB" -f "$SQL")

jumlah_pulih=$(sudo -u postgres psql -At -d "$UJI" -f "$SQL" | wc -l)
jumlah_aktif=$(sudo -u postgres psql -At -d "$DB" -f "$SQL" | wc -l)
if [ "$jumlah_pulih" -ne "$jumlah_aktif" ]; then
  echo "GAGAL: backup berisi $jumlah_pulih tabel, database aktif $jumlah_aktif." >&2
  exit 1
fi
echo "PULIH OK: backup $TGL berhasil dipulihkan ($jumlah_pulih tabel, arsip file & konfigurasi utuh)."
