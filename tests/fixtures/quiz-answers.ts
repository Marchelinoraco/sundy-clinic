import type { QuizAnswers } from "@/lib/kuis/v1/answers";

export const slimmingNewPatient = {
  patientType: "BARU",
  purpose: "SLIMMING",
  slimming: {
    goal: "TURUN_BERAT",
    weightTarget: "KG_5_10",
    areas: ["PERUT", "PAHA"],
    dietHistory: "PERNAH",
    dietPrograms: ["KURANGI_KARBO", "INTERMITTENT_FASTING"],
    dietResults: {
      KURANGI_KARBO: { outcome: "BERHASIL", lostKg: 8, weightAfter: "NAIK_SEBAGIAN" },
      INTERMITTENT_FASTING: { outcome: "TIDAK_BERHASIL" },
    },
    weightKg: 72,
    heightCm: 158,
    foodRecall: { pagi: "Nasi kuning, teh manis", siang: "Nasi, ikan bakar" },
  },
  health: {
    conditions: ["DARAH_TINGGI", "DIABETES"],
    medications: {
      DARAH_TINGGI: { text: "Amlodipine 5 mg, 1× sehari" },
      DIABETES: { none: true },
    },
    otherMeds: { has: true, text: "Vitamin D, pil KB" },
    allergies: { has: true, text: "Amoxicillin (gatal-gatal)" },
    pregnancy: "TIDAK",
  },
} satisfies QuizAnswers;

export const aestheticNewPatient = {
  patientType: "BARU",
  purpose: "AESTHETIC",
  aesthetic: {
    complaints: ["JERAWAT", "PORI_BESAR"],
    skinType: "BERMINYAK",
    duration: "BULAN_3_12",
    priorTreatments: ["FACIAL_PEELING"],
    skincare: "Sabun cuci muka, sunscreen",
  },
  health: {
    conditions: ["TIDAK_ADA"],
    otherMeds: { has: false },
    allergies: { has: false },
    pregnancy: "TIDAK",
  },
} satisfies QuizAnswers;

export const unsureNewPatient = {
  patientType: "BARU",
  purpose: "BELUM_YAKIN",
  unsure: { story: "Ingin konsultasi soal berat badan dan jerawat." },
  health: {
    conditions: ["TIDAK_ADA"],
    otherMeds: { has: false },
    allergies: { has: false },
    pregnancy: "TIDAK_BERLAKU",
  },
} satisfies QuizAnswers;

export const slimmingReturningPatient = {
  patientType: "LAMA",
  purpose: "SLIMMING",
  returning: {
    story: "Berat turun 2 kg, sering lapar malam.",
    healthChanged: true,
    activities: [
      { hour: 6, kind: "KAPSUL_OBAT", text: "Kapsul M" },
      { hour: 7, kind: "MAKAN_MINUM", text: "Roti gandum, kopi" },
      { hour: 12, kind: "MAKAN_MINUM", text: "Nasi ½, ikan bakar" },
      { hour: 12, kind: "KAPSUL_OBAT", text: "Fat Blocker" },
      { hour: 13, kind: "OLAHRAGA", text: "Jalan kaki 30 menit" },
    ],
  },
  health: {
    conditions: ["DARAH_TINGGI"],
    medications: { DARAH_TINGGI: { text: "Amlodipine 5 mg, 1× sehari" } },
    otherMeds: { has: false },
    allergies: { has: false },
  },
} satisfies QuizAnswers;

export const aestheticReturningPatient = {
  patientType: "LAMA",
  purpose: "AESTHETIC",
  returning: { story: "Ingin facial lagi, jerawat muncul di dagu.", healthChanged: false },
} satisfies QuizAnswers;

export const newPatientIdentity = {
  name: "Siti Rahayu",
  whatsapp: "0812-3456-7890",
  birthDate: "1992-04-17",
  gender: "P",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi No. 5, Manado",
};

export const returningPatientIdentity = {
  name: "Siti Rahayu",
  whatsapp: "081234567890",
  birthDate: "1992-04-17",
};
