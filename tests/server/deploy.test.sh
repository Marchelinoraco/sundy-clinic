#!/usr/bin/env bash
# Uji deploy.sh tanpa server: git, npm, npx, dan pm2 diganti tiruan di PATH.
set -euo pipefail

SINI=$(cd "$(dirname "$0")" && pwd)
DEPLOY="$SINI/../../scripts/server/deploy.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

export SUNDY_ROOT=$TMP/www/sundy SUNDY_REPO=$TMP/repo-palsu SUNDY_KEEP=3
export LOG=$TMP/perintah.log
mkdir -p "$SUNDY_ROOT/shared" "$TMP/bin"
echo 'DATABASE_URL="postgresql://uji"' > "$SUNDY_ROOT/shared/.env"

cat > "$TMP/bin/git" <<'STUB'
#!/usr/bin/env bash
# git clone --quiet --depth 1 --branch <b> <repo> <dir>
dir=${*: -1}
mkdir -p "$dir/public" "$dir/scripts/server"
echo '{}' > "$dir/package.json"
touch "$dir/public/logo.png"
if [ -n "${GAGAL_BUILD:-}" ]; then touch "$dir/.gagal"; fi
STUB
cat > "$TMP/bin/npm" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  ci) mkdir -p node_modules ;;
  run)
    if [ -e .gagal ]; then echo "build gagal" >&2; exit 1; fi
    mkdir -p .next/standalone .next/static/chunks
    touch .next/standalone/server.js .next/static/chunks/app.js ;;
esac
STUB
cat > "$TMP/bin/find" <<'STUB'
#!/usr/bin/env bash
# Tiru find GNU (Ubuntu): gagal bila folder kerja awal tidak bisa diakses pemanggil.
# find bawaan macOS tidak begitu, sehingga tanpa tiruan ini bug-nya tidak terlihat di uji.
if ! ls "$PWD" > /dev/null 2>&1; then
  echo "find: Failed to restore initial working directory: $PWD: Permission denied" >&2; exit 1
fi
exec /usr/bin/find "$@"
STUB
printf '#!/usr/bin/env bash\necho "npx $*" >> "$LOG"\n' > "$TMP/bin/npx"
printf '#!/usr/bin/env bash\necho "pm2 $*" >> "$LOG"\n' > "$TMP/bin/pm2"
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH"

lulus=0; gagal=0
periksa() {
  if eval "$2"; then lulus=$((lulus + 1)); echo "  ✓ $1"; else gagal=$((gagal + 1)); echo "  ✗ $1"; fi
}
jumlah_rilis() { ls "$SUNDY_ROOT/releases" | wc -l | tr -d ' '; }

echo "rilis pertama"
bash "$DEPLOY" > /dev/null
R1=$(readlink "$SUNDY_ROOT/current")
periksa "current menunjuk folder di releases/" '[ -d "$R1" ] && [ "$(dirname "$R1")" = "$SUNDY_ROOT/releases" ]'
periksa ".env rilis adalah link ke shared/.env" '[ "$(readlink "$R1/.env")" = "$SUNDY_ROOT/shared/.env" ]'
periksa "public disalin ke server mandiri" '[ -f "$R1/.next/standalone/public/logo.png" ]'
periksa "aset statis disalin ke server mandiri" '[ -f "$R1/.next/standalone/.next/static/chunks/app.js" ]'
periksa "node_modules dipertahankan (untuk skrip admin)" '[ -d "$R1/node_modules" ]'
periksa "migrasi database dijalankan" 'grep -q "npx prisma migrate deploy" "$LOG"'
periksa "PM2 dimulai dari ecosystem.config.cjs" 'grep -q "pm2 start .*ecosystem.config.cjs" "$LOG"'

echo "rilis yang gagal tidak mengubah versi aktif"
if GAGAL_BUILD=1 bash "$DEPLOY" > /dev/null 2>&1; then status=0; else status=1; fi
periksa "deploy.sh keluar dengan galat" '[ "$status" = 1 ]'
periksa "current tetap rilis pertama" '[ "$(readlink "$SUNDY_ROOT/current")" = "$R1" ]'
periksa "folder rilis gagal dibersihkan" '[ "$(jumlah_rilis)" = 1 ]'

echo "hanya 3 rilis disimpan"
for _ in 2 3 4; do bash "$DEPLOY" > /dev/null; done
periksa "tersisa 3 folder rilis" '[ "$(jumlah_rilis)" = 3 ]'
periksa "rilis pertama sudah terhapus" '[ ! -e "$R1" ]'

echo "kembali ke rilis sebelumnya — dipanggil dari folder yang tidak bisa diakses"
# Di server, admin memanggil deploy.sh sebagai sundyapp dari /home/sundy yang tidak bisa dimasuki
# sundyapp; skrip harus tetap bekerja dan tidak boleh gagal diam-diam.
R4=$(readlink "$SUNDY_ROOT/current")
mkdir "$TMP/terkunci"
if (cd "$TMP/terkunci" && chmod 000 "$TMP/terkunci" && bash "$DEPLOY" kembali > /dev/null 2>&1); then status=0; else status=$?; fi
chmod 755 "$TMP/terkunci"
R3=$(readlink "$SUNDY_ROOT/current")
periksa "deploy.sh kembali keluar tanpa galat" '[ "$status" = 0 ]'
periksa "current pindah ke rilis yang lebih lama" '[ "$R3" != "$R4" ] && [[ "$R3" < "$R4" ]]'

echo
echo "$lulus lulus, $gagal gagal"
[ "$gagal" = 0 ]
