/**
 * Asal permintaan harus situs ini sendiri (cookie sesi saja tidak cukup bagi rute yang menulis). Hanya header `host`
 * yang dipakai: nginx mengisinya dari `$host`, sedangkan `x-forwarded-host` bisa dikirim klien.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
