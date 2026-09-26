#!/usr/bin/env bash
# Backup harian SunDY → IDCloudHost Object Storage, TERENKRIPSI (remote rclone "sundy-crypt").
# Isi: dump PostgreSQL (format custom), folder file pasien, dan konfigurasi.
# Retensi: 7 hari lokal; 30 hari di bucket, dihitung dari NAMA folder bertanggal (bukan umur
# file — pelajaran dari Wm-2026).
# Dijalankan cron aaPanel setiap hari 02.00 WITA sebagai root:
#   /www/sundy/current/scripts/server/backup.sh
set -euo pipefail

exec 9> "${SUNDY_LOCK:-/run/sundy-backup.lock}"
flock -n 9 || { echo "Backup lain masih berjalan."; exit 1; }

KONF=${SUNDY_BACKUP_ENV:-/root/.config/sundy-backup.env} # berisi HEARTBEAT_URL
# shellcheck disable=SC1090
[ -f "$KONF" ] && . "$KONF"
REMOTE=${SUNDY_REMOTE:-sundy-crypt:}
LOKAL=${SUNDY_BACKUP_DIR:-/root/backup}
FILES=${PATIENT_FILES_DIR:-/www/sundy-files}
DB=${SUNDY_DB:-sundy}
TAR_ROOT=${SUNDY_TAR_ROOT:-/}
KONFIG=${SUNDY_KONFIG:-"www/sundy/shared/.env www/server/panel/vhost/nginx www/server/panel/vhost/rewrite"}
TGL=$(date +%F)
BATAS=$(date -d '30 days ago' +%F 2> /dev/null || date -v-30d +%F)
DIR=$LOKAL/$TGL

lapor() { # $1 = "" (sukses) atau "/fail"
  if [ -n "${HEARTBEAT_URL:-}" ]; then curl -fsS -m 10 --retry 3 "${HEARTBEAT_URL}$1" > /dev/null || true; fi
}
trap 'lapor /fail' ERR

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"

sudo -u postgres pg_dump -Fc "$DB" > "$DIR/$DB.dump"
tar -czf "$DIR/file-pasien.tar.gz" -C "$(dirname "$FILES")" "$(basename "$FILES")"
# shellcheck disable=SC2086 # KONFIG sengaja dipecah menjadi beberapa jalur
tar -czf "$DIR/konfigurasi.tar.gz" -C "$TAR_ROOT" $KONFIG

find "$LOKAL" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

rclone copy "$DIR" "${REMOTE}harian/$TGL"

for D in $(rclone lsf --dirs-only "${REMOTE}harian" 2> /dev/null); do
  D=${D%/}
  if [[ $D =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && $D < $BATAS ]]; then
    rclone purge "${REMOTE}harian/$D"
  fi
done

lapor ""
echo "Backup $TGL selesai: $(ls "$DIR" | tr '\n' ' ')($(du -sh "$DIR" | cut -f1))"
