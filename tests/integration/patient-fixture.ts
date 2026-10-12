import type { PatientRegistrationInput } from "@/lib/patient-registration";

// Bagian 7–12 NIK = tanggal lahir (ddmmyy) → "010190" cocok dengan birthDate bawaan 1990-01-01.
let next = Math.floor(Math.random() * 9000);

/** NIK 16 angka yang berbeda di tiap panggilan, untuk uji yang membuat banyak pasien lewat createPatient. */
export function uniqueNik(): string {
  next = (next + 1) % 10_000;
  return `717101010190${String(next).padStart(4, "0")}`;
}

/** Isian pendaftaran pasien yang lengkap dan sah; timpa seperlunya. Bila memakai nikMissingReason, set nik: null. */
export function patientInput(patch: Partial<PatientRegistrationInput> = {}): PatientRegistrationInput {
  return {
    nik: uniqueNik(),
    nikMissingReason: null,
    name: "Siti Rahayu",
    birthDate: "1990-01-01",
    whatsapp: "6281234567890",
    email: "",
    emergencyContactName: "Budi Rahayu",
    emergencyContactPhone: "6281298765432",
    address: "Jl. Sam Ratulangi 10, Manado",
    maritalStatus: null,
    ...patch,
  };
}
