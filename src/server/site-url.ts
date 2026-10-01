/**
 * Alamat situs publik untuk tautan di pesan WhatsApp (mis. cek booking). Sama
 * dengan alamat yang dipakai Better Auth, jadi tidak ada alamat yang ditulis di kode.
 */
export function publicSiteUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error("BETTER_AUTH_URL belum diisi di .env.");
  return url.replace(/\/+$/, "");
}
