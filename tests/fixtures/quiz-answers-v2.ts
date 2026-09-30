import type { QuizAnswers } from "@/lib/kuis/v2/answers";

export { newPatientIdentity, returningPatientIdentity } from "./quiz-answers";

const habits = {
  wakeHour: 6,
  sleepHour: 22,
  breakfast: { hour: 7, text: "Nasi kuning 1 piring, teh manis 1 gelas" },
  lunch: { hour: 12, text: "Nasi 1 piring, ikan bakar 1 potong, sayur" },
  dinner: { hour: 19, text: "Nasi ½ piring, ayam goreng 1 potong" },
  snack: { frequency: "HAMPIR_SETIAP_HARI", hour: 16, text: "Pisang goreng 2 potong" },
  exercise: { routine: "KADANG", kind: "Jalan kaki", minutes: 30, perWeek: 2, hour: 17 },
  smoking: "TIDAK",
  alcohol: "TIDAK",
  soda: "KADANG",
} satisfies NonNullable<QuizAnswers["habits"]>;

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
  },
  body: { weightKg: 72, heightCm: 158 },
  habits,
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

export const nutritionNewPatient = {
  patientType: "BARU",
  purpose: "GIZI_KLINIK",
  nutrition: { story: "Gula darah tinggi, ingin atur pola makan." },
  body: { weightKg: 65, heightCm: 160 },
  habits,
  health: {
    conditions: ["DIABETES"],
    medications: { DIABETES: { text: "Metformin 500 mg, 2× sehari" } },
    otherMeds: { has: false },
    allergies: { has: true, text: "Udang" },
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

export const slimmingReturningPatient = {
  patientType: "LAMA",
  purpose: "SLIMMING",
  returning: { story: "Berat turun 2 kg, sering lapar malam.", healthChanged: true },
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
