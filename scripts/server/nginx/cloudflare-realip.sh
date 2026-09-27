#!/usr/bin/env bash
# Menulis konfigurasi Nginx agar $remote_addr = IP asli pengunjung di balik proxy Cloudflare.
# Daftar IP diambil dari sumber resmi Cloudflare setiap kali dijalankan.
# Pakai (root): cloudflare-realip.sh /www/server/panel/vhost/nginx/0.cloudflare-realip.conf
set -euo pipefail
KELUAR=${1:?Pakai: cloudflare-realip.sh <berkas-keluaran>}
SEMENTARA=$(mktemp)
{
  echo "# Dibuat oleh scripts/server/nginx/cloudflare-realip.sh pada $(date +%F) — jangan diubah manual."
  for daftar in ips-v4 ips-v6; do
    curl -fsS -m 20 "https://www.cloudflare.com/$daftar" | while read -r net; do
      [ -n "$net" ] && echo "set_real_ip_from $net;"
    done
  done
  echo "real_ip_header CF-Connecting-IP;"
} > "$SEMENTARA"
grep -q '^set_real_ip_from ' "$SEMENTARA" || { echo "Daftar IP Cloudflare kosong — dibatalkan." >&2; exit 1; }
install -m 644 "$SEMENTARA" "$KELUAR"
rm -f "$SEMENTARA"
echo "Ditulis: $KELUAR ($(grep -c '^set_real_ip_from' "$KELUAR") jaringan)"
