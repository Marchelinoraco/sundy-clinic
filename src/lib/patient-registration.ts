import { isNikMissingReason, NIK_FORMAT_ERROR, normalizeNik, type NikMissingReasonValue } from "@/lib/nik";
import { normalizeWhatsapp } from "@/lib/whatsapp";

/** Status pernikahan pasien (opsional). Nilainya sama dengan enum `MaritalStatus` di basis data. */
export const MARITAL_STATUS_LABEL = {
  BELUM_MENIKAH: "Belum menikah",
  MENIKAH: "Menikah",
  CERAI_HIDUP: "Cerai hidup",
  CERAI_MATI: "Cerai mati",
} as const;

export type MaritalStatusValue = keyof typeof MARITAL_STATUS_LABEL;

export function isMaritalStatus(value: unknown): value is MaritalStatusValue {
  return typeof value === "string" && Object.hasOwn(MARITAL_STATUS_LABEL, value);
}

export const NAME_MAX = 100;
export const ADDRESS_MAX = 300;
export const EMAIL_MAX = 254;
export const BIRTH_DATE_MIN = "1900-01-01";

/** Urutan isian di formulir; galat pertama yang dikembalikan server mengikuti urutan ini. */
export const REGISTRATION_FIELDS = [
  "nik",
  "name",
  "birthDate",
  "whatsapp",
  "email",
  "emergencyContactName",
  "emergencyContactPhone",
  "address",
  "maritalStatus",
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

/** Yang dikirim dialog ke server: isian apa adanya (NIK/nomor belum dinormalkan). */
export type PatientRegistrationInput = {
  /** Diisi bila memilih "Isi NIK"; null bila memilih "Belum ada NIK". */
  nik: string | null;
  /** Diisi bila memilih "Belum ada NIK"; null bila mengisi NIK. */
  nikMissingReason: string | null;
  name: string;
  /** "YYYY-MM-DD". */
  birthDate: string;
  whatsapp: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: string | null;
};

export type ValidPatientRegistration = {
  nik: string | null;
  nikMissingReason: NikMissingReasonValue | null;
  name: string;
  birthDate: Date;
  whatsapp: string;
  email: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: MaritalStatusValue | null;
};

export type RegistrationResult = { ok: true; value: ValidPatientRegistration } | { ok: false; errors: RegistrationErrors };

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Server action menerima apa pun dari browser; nilai bukan teks dihitung kosong. */
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const isBlank = (value: unknown): boolean => value === null || value === undefined || value === "";

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Aturan pendaftaran pasien di panel (spec bagian 4). Dipakai server (sebelum nomor rekam medis
 * dialokasikan) dan dialog (galat per isian). `today` berbentuk "YYYY-MM-DD" di zona waktu klinik.
 */
export function validatePatientRegistration(input: Record<string, unknown>, today: string): RegistrationResult {
  const errors: RegistrationErrors = {};

  let nik: string | null = null;
  let nikMissingReason: NikMissingReasonValue | null = null;
  const nikText = text(input.nik).trim();
  if (nikText && !isBlank(input.nikMissingReason)) {
    errors.nik = "Pilih salah satu: isi NIK atau belum ada NIK.";
  } else if (nikText) {
    nik = normalizeNik(nikText);
    if (!nik) errors.nik = NIK_FORMAT_ERROR;
  } else if (isNikMissingReason(input.nikMissingReason)) {
    nikMissingReason = input.nikMissingReason;
  } else {
    errors.nik = "Isi NIK 16 angka, atau pilih alasan belum ada NIK.";
  }

  const name = text(input.name).trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Nama pasien wajib diisi.";
  else if (name.length > NAME_MAX) errors.name = `Nama pasien paling banyak ${NAME_MAX} karakter.`;

  const birthText = text(input.birthDate).trim();
  if (!birthText) errors.birthDate = "Tanggal lahir wajib diisi.";
  else if (!isRealDate(birthText)) errors.birthDate = "Tanggal lahir tidak sah.";
  else if (birthText > today) errors.birthDate = "Tanggal lahir tidak boleh di masa depan.";
  else if (birthText < BIRTH_DATE_MIN) errors.birthDate = "Tanggal lahir tidak boleh sebelum tahun 1900.";

  const whatsappText = text(input.whatsapp).trim();
  const whatsapp = whatsappText ? normalizeWhatsapp(whatsappText) : null;
  if (!whatsappText) errors.whatsapp = "Nomor HP (WhatsApp) wajib diisi.";
  else if (!whatsapp) errors.whatsapp = "Nomor HP (WhatsApp) tidak sah. Contoh: 081234567890.";

  let email: string | null = null;
  const emailText = text(input.email).trim().toLowerCase();
  if (emailText) {
    if (emailText.length > EMAIL_MAX || !EMAIL_PATTERN.test(emailText)) errors.email = "Email tidak sah. Contoh: nama@contoh.com.";
    else email = emailText;
  }

  const emergencyContactName = text(input.emergencyContactName).trim().replace(/\s+/g, " ");
  if (!emergencyContactName) errors.emergencyContactName = "Nama kontak darurat wajib diisi.";
  else if (emergencyContactName.length > NAME_MAX) errors.emergencyContactName = `Nama kontak darurat paling banyak ${NAME_MAX} karakter.`;

  const emergencyPhoneText = text(input.emergencyContactPhone).trim();
  const emergencyContactPhone = emergencyPhoneText ? normalizeWhatsapp(emergencyPhoneText) : null;
  if (!emergencyPhoneText) errors.emergencyContactPhone = "Nomor kontak darurat wajib diisi.";
  else if (!emergencyContactPhone) errors.emergencyContactPhone = "Nomor kontak darurat tidak sah. Contoh: 081234567890.";

  const address = text(input.address).trim();
  if (!address) errors.address = "Alamat wajib diisi.";
  else if (address.length > ADDRESS_MAX) errors.address = `Alamat paling banyak ${ADDRESS_MAX} karakter.`;

  let maritalStatus: MaritalStatusValue | null = null;
  if (!isBlank(input.maritalStatus)) {
    if (isMaritalStatus(input.maritalStatus)) maritalStatus = input.maritalStatus;
    else errors.maritalStatus = "Status pernikahan tidak dikenal.";
  }

  if (Object.keys(errors).length > 0 || !whatsapp || !emergencyContactPhone) return { ok: false, errors };
  return {
    ok: true,
    value: {
      nik,
      nikMissingReason,
      name,
      birthDate: new Date(`${birthText}T00:00:00Z`),
      whatsapp,
      email,
      emergencyContactName,
      emergencyContactPhone,
      address,
      maritalStatus,
    },
  };
}

/** Pesan galat pertama menurut urutan formulir, untuk server yang mengembalikan satu pesan. */
export function firstRegistrationError(errors: RegistrationErrors): string {
  for (const field of REGISTRATION_FIELDS) {
    const message = errors[field];
    if (message) return message;
  }
  return "Data pasien belum lengkap.";
}

/** "NIK ini sudah terdaftar atas nama …" — dipakai dialog Pasien baru dan dialog paket lama (spec paket lama bagian 4). */
export function nikTakenMessage(owner: { name: string; medicalRecordNumber: string }): string {
  return `NIK ini sudah terdaftar atas nama ${owner.name} (${owner.medicalRecordNumber}).`;
}

/** Pasien baru dari dialog paket lama Kluto (spec paket lama PL9): isian apa adanya dari browser. */
export type LegacyPatientInput = {
  nik: string;
  name: string;
  whatsapp: string;
  birthDate: string;
  gender: string | null;
  address: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export type ValidLegacyPatient = {
  nik: string | null;
  name: string;
  whatsapp: string;
  birthDate: Date | null;
  gender: "L" | "P" | null;
  address: string | null;
  email: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type LegacyPatientErrors = Partial<Record<keyof LegacyPatientInput, string>>;

/** Urutan isian di dialog paket lama; galat pertama server mengikuti urutan ini. */
const LEGACY_PATIENT_FIELDS: readonly (keyof LegacyPatientInput)[] = [
  "name",
  "whatsapp",
  "nik",
  "birthDate",
  "gender",
  "address",
  "email",
  "emergencyContactName",
  "emergencyContactPhone",
];

/**
 * Seperti validatePatientRegistration, tetapi hanya nama dan WA yang wajib (PL9): sisanya dilengkapi saat check-in.
 * Isian yang diisi tetap diperiksa dengan aturan dan pesan yang sama; NIK kosong tidak butuh alasan.
 */
export function validateLegacyPatient(
  input: Record<string, unknown>,
  today: string,
): { ok: true; value: ValidLegacyPatient } | { ok: false; errors: LegacyPatientErrors } {
  const errors: LegacyPatientErrors = {};

  const nikText = text(input.nik).trim();
  const nik = nikText ? normalizeNik(nikText) : null;
  if (nikText && !nik) errors.nik = NIK_FORMAT_ERROR;

  const name = text(input.name).trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Nama pasien wajib diisi.";
  else if (name.length > NAME_MAX) errors.name = `Nama pasien paling banyak ${NAME_MAX} karakter.`;

  const whatsappText = text(input.whatsapp).trim();
  const whatsapp = whatsappText ? normalizeWhatsapp(whatsappText) : null;
  if (!whatsappText) errors.whatsapp = "Nomor HP (WhatsApp) wajib diisi.";
  else if (!whatsapp) errors.whatsapp = "Nomor HP (WhatsApp) tidak sah. Contoh: 081234567890.";

  const birthText = text(input.birthDate).trim();
  if (birthText) {
    if (!isRealDate(birthText)) errors.birthDate = "Tanggal lahir tidak sah.";
    else if (birthText > today) errors.birthDate = "Tanggal lahir tidak boleh di masa depan.";
    else if (birthText < BIRTH_DATE_MIN) errors.birthDate = "Tanggal lahir tidak boleh sebelum tahun 1900.";
  }

  let gender: "L" | "P" | null = null;
  if (!isBlank(input.gender)) {
    if (input.gender === "L" || input.gender === "P") gender = input.gender;
    else errors.gender = "Jenis kelamin tidak dikenal.";
  }

  const address = text(input.address).trim();
  if (address.length > ADDRESS_MAX) errors.address = `Alamat paling banyak ${ADDRESS_MAX} karakter.`;

  const emailText = text(input.email).trim().toLowerCase();
  if (emailText && (emailText.length > EMAIL_MAX || !EMAIL_PATTERN.test(emailText))) errors.email = "Email tidak sah. Contoh: nama@contoh.com.";

  const emergencyContactName = text(input.emergencyContactName).trim().replace(/\s+/g, " ");
  const emergencyPhoneText = text(input.emergencyContactPhone).trim();
  const emergencyContactPhone = emergencyPhoneText ? normalizeWhatsapp(emergencyPhoneText) : null;
  if (emergencyContactName.length > NAME_MAX) errors.emergencyContactName = `Nama kontak darurat paling banyak ${NAME_MAX} karakter.`;
  else if (!emergencyContactName && emergencyPhoneText) errors.emergencyContactName = "Nama kontak darurat wajib diisi.";
  if (emergencyPhoneText && !emergencyContactPhone) errors.emergencyContactPhone = "Nomor kontak darurat tidak sah. Contoh: 081234567890.";
  else if (emergencyContactName && !emergencyPhoneText) errors.emergencyContactPhone = "Nomor kontak darurat wajib diisi.";

  if (Object.keys(errors).length > 0 || !whatsapp) return { ok: false, errors };
  return {
    ok: true,
    value: {
      nik,
      name,
      whatsapp,
      birthDate: birthText ? new Date(`${birthText}T00:00:00Z`) : null,
      gender,
      address: address || null,
      email: emailText || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone,
    },
  };
}

export function firstLegacyPatientError(errors: LegacyPatientErrors): string {
  for (const field of LEGACY_PATIENT_FIELDS) {
    const message = errors[field];
    if (message) return message;
  }
  return "Data pasien belum lengkap.";
}
