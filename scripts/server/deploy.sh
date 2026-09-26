#!/usr/bin/env bash
# Rilis SunDY di VPS. Jalankan sebagai user "sundyapp":
#   sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh           # rilis main terbaru
#   sudo -u sundyapp -H /www/sundy/current/scripts/server/deploy.sh kembali   # kembali ke rilis sebelumnya
#
# Susunan:
#   releases/<YYYYmmdd-HHMMSS>/   kode + build (node_modules disimpan untuk skrip admin)
#   current -> releases/<aktif>   dijalankan PM2 (scripts/server/ecosystem.config.cjs)
#   shared/.env                   rahasia; di-link ke setiap rilis, tidak pernah disalin
#
# Selama build berjalan, rilis lama tetap melayani pasien. Rilis yang gagal dihapus dan
# versi aktif tidak berubah. Perhatian: migrasi database dijalankan SEBELUM rilis baru
# aktif, jadi perubahan skema harus tetap cocok dengan kode rilis sebelumnya.
# -E: trap ERR juga berlaku di dalam fungsi (dipakai untuk membersihkan rilis yang gagal).
set -Eeuo pipefail

ROOT=${SUNDY_ROOT:-/www/sundy}
REPO=${SUNDY_REPO:-https://github.com/Marchelinoraco/sundy-clinic.git}
BRANCH=${SUNDY_BRANCH:-main}
KEEP=${SUNDY_KEEP:-3}
RELEASES=$ROOT/releases
dir=""

log() { printf '[deploy] %s\n' "$*"; }

daftar_rilis() { # terlama → terbaru
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d 2> /dev/null | sort
}

aktifkan() { # $1 = folder rilis
  ln -sfn "$1" "$ROOT/current"
  pm2 delete sundy > /dev/null 2>&1 || true
  pm2 start "$ROOT/current/scripts/server/ecosystem.config.cjs"
  pm2 save > /dev/null
}

bersihkan() { # sisakan $KEEP rilis terbaru; rilis aktif tidak pernah dihapus
  local aktif lama
  aktif=$(readlink "$ROOT/current")
  # Semua kecuali $KEEP terakhir (awk, karena `head -n -N` tidak ada di macOS tempat uji berjalan).
  daftar_rilis | awk -v k="$KEEP" '{ a[NR] = $0 } END { for (i = 1; i <= NR - k; i++) print a[i] }' | while read -r lama; do
    [ "$lama" = "$aktif" ] && continue
    log "hapus rilis lama $(basename "$lama")"
    rm -rf "$lama"
  done
}

rilis() {
  local waktu
  mkdir -p "$RELEASES"
  waktu=$(date +%Y%m%d-%H%M%S)
  while [ -e "$RELEASES/$waktu" ]; do sleep 1; waktu=$(date +%Y%m%d-%H%M%S); done
  dir=$RELEASES/$waktu
  trap 'log "GAGAL — versi aktif tidak berubah"; rm -rf "$dir"' ERR

  log "ambil $BRANCH dari $REPO → releases/$waktu"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$dir"
  ln -s "$ROOT/shared/.env" "$dir/.env"
  cd "$dir"

  log "npm ci"
  npm ci --no-audit --no-fund
  log "migrasi database"
  npx prisma migrate deploy
  log "build"
  npm run build
  # Server mandiri tidak membawa public/ dan .next/static/ — salin sendiri.
  cp -R public .next/standalone/public
  mkdir -p .next/standalone/.next
  cp -R .next/static .next/standalone/.next/static

  trap - ERR
  aktifkan "$dir"
  log "aktif: $waktu"
  bersihkan
}

kembali() {
  local aktif sebelum
  aktif=$(readlink "$ROOT/current")
  sebelum=$(daftar_rilis | awk -v a="$aktif" '$0 < a' | tail -n 1)
  if [ -z "$sebelum" ]; then
    log "tidak ada rilis sebelum $(basename "$aktif")"
    exit 1
  fi
  aktifkan "$sebelum"
  log "kembali ke $(basename "$sebelum")"
}

case "${1:-rilis}" in
  rilis) rilis ;;
  kembali) kembali ;;
  *) echo "Pakai: deploy.sh [rilis|kembali]" >&2; exit 2 ;;
esac
