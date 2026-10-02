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

/** Tanggal lahir nyata, sebelum hari ini (WITA), dan paling lama 120 tahun lalu. */
function isValidBirthDate(value: string, now: Date): boolean {
  const today = witaDateString(now);
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  return isRealDate(value) && value < today && value >= oldest;
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

  if (!isValidBirthDate(data.birthDate, now)) return fail("birthDate", "Isi tanggal lahir yang benar.");

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

/** Kolom data diri yang ditanyakan halaman link kuis bila masih kosong di data pasien (spec C3 3.2). */
export const IDENTITY_FIELDS = ["birthDate", "gender", "occupation", "address"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export type LinkIdentity = { birthDate?: string; gender?: "L" | "P"; occupation?: string; address?: string };

export type LinkIdentityValidation =
  | { ok: true; identity: LinkIdentity }
  | { ok: false; field: IdentityField | null; message: string };

const linkIdentityShape = z.strictObject({
  birthDate: z.string().optional(),
  gender: z.enum(["L", "P"]).optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
});

function linkFail(field: IdentityField | null, message: string): LinkIdentityValidation {
  return { ok: false, field, message };
}

/**
 * Data diri dari halaman link kuis. Nama dan WA sudah dicatat admin, jadi
 * hanya kolom di `missing` yang diperiksa dan dikembalikan — kolom lain
 * diabaikan walau dikirim, karena data pasien yang terisi tidak boleh ditimpa.
 */
export function validateLinkIdentity(
  raw: unknown,
  missing: readonly IdentityField[],
  now: Date = new Date(),
): LinkIdentityValidation {
  const parsed = linkIdentityShape.safeParse(raw);
  if (!parsed.success) return linkFail(null, "Data diri tidak sah. Muat ulang halaman lalu coba lagi.");
  const data = parsed.data;
  const identity: LinkIdentity = {};

  if (missing.includes("birthDate")) {
    if (!data.birthDate || !isValidBirthDate(data.birthDate, now)) {
      return linkFail("birthDate", "Isi tanggal lahir yang benar.");
    }
    identity.birthDate = data.birthDate;
  }
  if (missing.includes("gender")) {
    if (!data.gender) return linkFail("gender", "Pilih jenis kelamin.");
    identity.gender = data.gender;
  }
  if (missing.includes("occupation")) {
    const occupation = data.occupation?.trim() ?? "";
    if (!occupation || occupation.length > 100) return linkFail("occupation", "Isi pekerjaan Anda.");
    identity.occupation = occupation;
  }
  if (missing.includes("address")) {
    const address = data.address?.trim() ?? "";
    if (!address || address.length > 200) return linkFail("address", "Isi alamat Anda (maksimal 200 karakter).");
    identity.address = address;
  }
  return { ok: true, identity };
}
