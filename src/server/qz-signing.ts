import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Tanda tangan QZ Tray (spec struk WA 7.2). Kunci RSA PKCS#8 dan sertifikat dibaca dari berkas di server
 * (QZ_PRIVATE_KEY_FILE, QZ_CERTIFICATE_FILE) setiap permintaan, jadi bisa dipasang tanpa deploy ulang.
 * Null bila belum diatur: klien lalu memakai mode tanpa tanda tangan (QZ Tray menampilkan dialog izin).
 */
async function readOptional(file: string | undefined): Promise<string | null> {
  if (!file) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export function readQzCertificate(): Promise<string | null> {
  return readOptional(process.env.QZ_CERTIFICATE_FILE);
}

export async function signQzRequest(toSign: string): Promise<string | null> {
  const key = await readOptional(process.env.QZ_PRIVATE_KEY_FILE);
  return key ? createSign("SHA512").update(toSign).sign(key, "base64") : null;
}
