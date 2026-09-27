#!/usr/bin/env bash
# Uji backup.sh tanpa server: sudo, pg_dump, rclone, curl, dan flock diganti tiruan.
set -euo pipefail

SINI=$(cd "$(dirname "$0")" && pwd)
BACKUP="$SINI/../../scripts/server/backup.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

export LOG=$TMP/perintah.log
export SUNDY_LOCK=$TMP/backup.lock
export SUNDY_BACKUP_ENV=$TMP/sundy-backup.env
export SUNDY_BACKUP_DIR=$TMP/backup
export PATIENT_FILES_DIR=$TMP/www/sundy-files
export SUNDY_TAR_ROOT=$TMP
export SUNDY_KONFIG="www/sundy/shared/.env"
mkdir -p "$PATIENT_FILES_DIR" "$TMP/www/sundy/shared" "$TMP/bin"
echo "hasil BIA" > "$PATIENT_FILES_DIR/bia-contoh.pdf"
echo 'DATABASE_URL="postgresql://uji"' > "$TMP/www/sundy/shared/.env"
echo 'HEARTBEAT_URL="https://hc.contoh/ping/abc"' > "$SUNDY_BACKUP_ENV"

cat > "$TMP/bin/sudo" <<'STUB'
#!/usr/bin/env bash
# sudo -u <user> <perintah...>
shift 2; exec "$@"
STUB
cat > "$TMP/bin/pg_dump" <<'STUB'
#!/usr/bin/env bash
if [ -n "${PG_GAGAL:-}" ]; then echo "pg_dump: koneksi gagal" >&2; exit 1; fi
echo "PGDMP isi-dump-palsu"
STUB
cat > "$TMP/bin/rclone" <<'STUB'
#!/usr/bin/env bash
echo "rclone $*" >> "$LOG"
if [ "$1" = lsf ]; then printf '%s\n' ${RCLONE_DIRS:-}; fi
STUB
printf '#!/usr/bin/env bash\necho "curl $*" >> "$LOG"\n' > "$TMP/bin/curl"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/flock"
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH"

HARI_INI=$(date +%F)
lulus=0; gagal=0
periksa() {
  if eval "$2"; then lulus=$((lulus + 1)); echo "  ✓ $1"; else gagal=$((gagal + 1)); echo "  ✗ $1"; fi
}

echo "backup berhasil"
RCLONE_DIRS="2020-01-01/ $HARI_INI/ catatan/" bash "$BACKUP" > /dev/null
D=$SUNDY_BACKUP_DIR/$HARI_INI
periksa "dump database dibuat" 'grep -q PGDMP "$D/sundy.dump"'
periksa "file pasien diarsipkan" 'tar -tzf "$D/file-pasien.tar.gz" | grep -q bia-contoh.pdf'
periksa "konfigurasi diarsipkan" 'tar -tzf "$D/konfigurasi.tar.gz" | grep -q "shared/.env"'
periksa "hanya root yang bisa membaca backup" '[ "$(ls -ld "$D" | cut -c1-10)" = "drwx------" ]'
periksa "diunggah ke remote terenkripsi" 'grep -q "rclone copy $D sundy-crypt:harian/$HARI_INI" "$LOG"'
periksa "folder > 30 hari dihapus" 'grep -q "rclone purge sundy-crypt:harian/2020-01-01" "$LOG"'
periksa "folder hari ini tidak dihapus" '! grep -q "rclone purge sundy-crypt:harian/$HARI_INI" "$LOG"'
periksa "folder bukan tanggal tidak disentuh" '! grep -q "purge sundy-crypt:harian/catatan" "$LOG"'
periksa "heartbeat sukses dikirim" 'grep -q "curl .*https://hc.contoh/ping/abc$" "$LOG"'

echo "backup gagal"
: > "$LOG"
if PG_GAGAL=1 bash "$BACKUP" > /dev/null 2>&1; then status=0; else status=1; fi
periksa "backup.sh keluar dengan galat" '[ "$status" = 1 ]'
periksa "heartbeat gagal dikirim" 'grep -q "curl .*https://hc.contoh/ping/abc/fail" "$LOG"'
periksa "tidak ada yang diunggah" '! grep -q "rclone copy" "$LOG"'

echo
echo "$lulus lulus, $gagal gagal"
[ "$gagal" = 0 ]
