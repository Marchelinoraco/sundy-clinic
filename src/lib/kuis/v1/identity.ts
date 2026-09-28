import { z } from "zod";
import { witaDateString } from "@/lib/time";
import { normalizeWhatsapp } from "@/lib/whatsapp";

export type Identity = {
  name: string;
  /** Sudah diseragamkan ke bentuk "62…". */
  whatsapp: string;
  /** "YYYY-MM-DD". */
  birthDate: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
};

export type IdentityValidation =
  | { ok: true; identity: Identity }
  | { ok: false; field: keyof Identity | null; message: string };

const identityShape = z.strictObject({
  name: z.string(),
  whatsapp: z.string(),
  birthDate: z.string(),
  gender: z.enum(["L", "P"]).optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
});

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  // Tanggal seperti 30 Februari "digulirkan" Date ke Maret — bandingkan balik.
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function fail(field: keyof Identity | null, message: string): IdentityValidation {
  return { ok: false, field, message };
}

/**
 * Data diri langkah D (spec 3.1). Pasien lama cukup nama, WA, dan tanggal
 * lahir — hanya untuk dicocokkan admin; pasien baru melengkapi sisanya.
 */
export function validateIdentity(
  raw: unknown,
  patientType: "BARU" | "LAMA",
  now: Date = new Date(),
): IdentityValidation {
  const parsed = identityShape.safeParse(raw);
  if (!parsed.success) return fail(null, "Data diri tidak sah. Muat ulang halaman lalu coba lagi.");
  const data = parsed.data;

  const name = data.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) return fail("name", "Tulis nama lengkap Anda.");

  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!whatsapp) return fail("whatsapp", "Nomor WhatsApp tidak sah. Contoh: 081234567890.");

  const today = witaDateString(now);
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  if (!isRealDate(data.birthDate) || data.birthDate >= today || data.birthDate < oldest) {
    return fail("birthDate", "Isi tanggal lahir yang benar.");
  }

  if (patientType === "LAMA") {
    return { ok: true, identity: { name, whatsapp, birthDate: data.birthDate } };
  }

  const occupation = data.occupation?.trim() ?? "";
  const address = data.address?.trim() ?? "";
  if (!data.gender) return fail("gender", "Pilih jenis kelamin.");
  if (!occupation || occupation.length > 100) return fail("occupation", "Isi pekerjaan Anda.");
  if (!address || address.length > 200) return fail("address", "Isi alamat Anda (maksimal 200 karakter).");

  return {
    ok: true,
    identity: { name, whatsapp, birthDate: data.birthDate, gender: data.gender, occupation, address },
  };
}
