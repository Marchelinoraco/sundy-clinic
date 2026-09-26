#!/usr/bin/env bash
# Pemeriksaan cepat situs SunDY setelah rilis.
# Pakai:  cek-situs.sh https://sundyclinic.com
#         cek-situs.sh http://sundyclinic.com --resolve sundyclinic.com:80:<IP>   (sebelum DNS)
# Keluar 0 bila semua pemeriksaan lulus.
set -uo pipefail

BASE=${1:?Pakai: cek-situs.sh <base-url> [opsi curl tambahan...]}
shift
EXTRA=("$@")
gagal=0

# ${EXTRA[@]+"${EXTRA[@]}"}: aman untuk larik kosong di bash 3.2 (macOS) dengan set -u.
kode() { curl -s -o /dev/null -m 20 -w '%{http_code}' ${EXTRA[@]+"${EXTRA[@]}"} "$BASE$1"; }
lapor() { # nama, lulus?
  if [ "$2" = 1 ]; then echo "  ✓ $1"; else echo "  ✗ $1"; gagal=1; fi
}

for jalur in / /layanan /program-slimming /masuk; do
  k=$(kode "$jalur")
  lapor "$jalur → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"
done

# /admin tanpa login harus dialihkan ke /masuk, bukan ditampilkan.
lokasi=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' ${EXTRA[@]+"${EXTRA[@]}"} "$BASE/admin")
lapor "/admin tanpa login → $lokasi (harus 30x ke /masuk)" \
  "$([[ $lokasi =~ ^30[1278]\ .*/masuk ]] && echo 1 || echo 0)"

# Aset statis harus ikut tersalin ke server mandiri.
aset=$(curl -s -m 20 ${EXTRA[@]+"${EXTRA[@]}"} "$BASE/" | grep -oE '/_next/static/[^"]+\.js' | head -1)
if [ -n "$aset" ]; then
  k=$(kode "$aset")
  lapor "aset $aset → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"
else
  lapor "halaman utama memuat aset /_next/static" 0
fi

k=$(kode /api/auth/get-session)
lapor "/api/auth/get-session → $k (harus 200)" "$([ "$k" = 200 ] && echo 1 || echo 0)"

exit $gagal
