/**
 * Kuis pendaftaran versi 2 — satu-satunya tempat kata-kata pilihan kuis v2
 * (spec kuis v2, 30 Sep 2026). Kunci (mis. "TURUN_BERAT") yang disimpan di
 * basis data; label hanya untuk tampilan. Kuis versi 1 dibekukan untuk
 * membaca isian lama.
 */
export const QUIZ_VERSION = 2;

export const PATIENT_TYPES = { BARU: "Belum, ini pertama kali", LAMA: "Sudah pernah" } as const;

export const PURPOSES = {
  SLIMMING: "Slimming",
  AESTHETIC: "Aesthetic",
  GIZI_KLINIK: "Konsultasi dokter spesialis gizi klinik",
} as const;

export const PURPOSE_HINTS = {
  SLIMMING: "Berat badan & bentuk tubuh",
  AESTHETIC: "Kulit & wajah",
  GIZI_KLINIK: "Pola makan untuk gula darah, kolesterol, asam urat, maag, dan lainnya",
} as const;

export const SLIMMING_GOALS = {
  TURUN_BERAT: "Menurunkan berat badan",
  KECILKAN_LINGKAR: "Mengecilkan lingkar tubuh",
  PASCA_MELAHIRKAN: "Kembali ideal setelah melahirkan",
  HIDUP_SEHAT: "Hidup lebih sehat & bugar",
} as const;

export const WEIGHT_TARGETS = {
  KG_1_5: "1–5 kg",
  KG_5_10: "5–10 kg",
  KG_10_20: "10–20 kg",
  KG_20_LEBIH: "Lebih dari 20 kg",
  BELUM_TAHU: "Belum tahu",
} as const;

export const BODY_AREAS = {
  PERUT: "Perut",
  LENGAN: "Lengan",
  PAHA: "Paha",
  PIPI_DAGU: "Pipi & dagu",
  TIDAK_ADA: "Tidak ada area khusus",
} as const;

export const DIET_HISTORY = {
  BELUM: "Belum pernah",
  PERNAH: "Pernah",
  SEDANG: "Sedang menjalani sekarang",
} as const;

export const DIET_PROGRAMS = {
  KURANGI_KARBO: "Kurangi nasi / karbo",
  KETO: "Keto",
  INTERMITTENT_FASTING: "Intermittent fasting",
  HITUNG_KALORI: "Hitung kalori",
  KATERING_DIET: "Katering diet",
  OLAHRAGA: "Olahraga / gym",
  OBAT_PELANGSING: "Obat / suplemen pelangsing",
  KLINIK_LAIN: "Program klinik lain",
  LAINNYA: "Lainnya",
} as const;

export const DIET_OUTCOMES = {
  BERHASIL: "Berhasil",
  TIDAK_BERHASIL: "Tidak berhasil",
  MASIH_JALAN: "Masih jalan",
} as const;

export const WEIGHT_AFTER_DIET = {
  BERTAHAN: "Bertahan",
  NAIK_SEBAGIAN: "Naik sebagian",
  NAIK_SEMUA: "Naik lagi semua",
} as const;

/** Form recall (kebiasaan): tiga waktu makan, satu layar per waktu makan (spec V5). */
export const MEALS = { breakfast: "Sarapan", lunch: "Makan siang", dinner: "Makan malam" } as const;

export const MEAL_NONE = {
  breakfast: "Saya tidak sarapan",
  lunch: "Saya tidak makan siang",
  dinner: "Saya tidak makan malam",
} as const;

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Pilihan jam per jam, sama dengan baris tabel dokter. 0–2 = lewat tengah malam. */
export const WAKE_HOURS = range(3, 12);
export const SLEEP_HOURS = [...range(18, 23), 0, 1, 2];
export const MEAL_HOURS = { breakfast: range(4, 12), lunch: range(10, 16), dinner: range(16, 23) } as const;
export const SNACK_HOURS = range(6, 23);
export const EXERCISE_HOURS = range(4, 23);

export const SNACK_FREQUENCIES = {
  HAMPIR_SETIAP_HARI: "Hampir setiap hari",
  SERING: "3–5× seminggu",
  KADANG: "1–2× seminggu",
  JARANG: "Jarang atau tidak pernah",
} as const;

export const EXERCISE_ROUTINES = { RUTIN: "Ya, rutin", KADANG: "Kadang-kadang", TIDAK: "Tidak berolahraga" } as const;

export const HABIT_LEVELS = { TIDAK: "Tidak", KADANG: "Kadang", SERING: "Sering" } as const;

export const HABITS = { smoking: "Merokok", alcohol: "Minum alkohol", soda: "Minuman bersoda" } as const;

export const SKIN_COMPLAINTS = {
  JERAWAT: "Jerawat & bekasnya",
  FLEK_KUSAM: "Flek & kulit kusam",
  KERUTAN: "Kerutan & garis halus",
  PORI_BESAR: "Pori-pori besar",
  KENDUR: "Kulit kendur / double chin",
  LAINNYA: "Lainnya",
} as const;

export const SKIN_TYPES = {
  BERMINYAK: "Berminyak",
  KERING: "Kering",
  KOMBINASI: "Kombinasi",
  SENSITIF: "Sensitif / mudah merah",
  TIDAK_TAHU: "Tidak tahu",
} as const;

export const COMPLAINT_DURATIONS = {
  KURANG_3_BULAN: "Kurang dari 3 bulan",
  BULAN_3_12: "3–12 bulan",
  LEBIH_1_TAHUN: "Lebih dari 1 tahun",
} as const;

export const PRIOR_TREATMENTS = {
  BELUM: "Belum pernah",
  FACIAL_PEELING: "Facial / peeling",
  LASER_INJEKSI: "Laser / injeksi",
  LAINNYA: "Lainnya",
} as const;

export const CONDITIONS = {
  DARAH_TINGGI: "Darah tinggi",
  DIABETES: "Diabetes",
  JANTUNG: "Penyakit jantung",
  TIROID: "Gangguan tiroid",
  LAMBUNG: "Asam lambung / maag",
  LAINNYA: "Penyakit lain",
  TIDAK_ADA: "Tidak ada",
} as const;

export const PREGNANCY = { YA: "Ya", TIDAK: "Tidak", TIDAK_BERLAKU: "Tidak berlaku" } as const;

/** Jawaban P2: pilihan ya/tidak ditampilkan sebagai kartu seperti pertanyaan lain. */
export const HEALTH_CHANGE = { TIDAK: "Tidak ada", ADA: "Ada" } as const;

/** Pilihan yang meniadakan pilihan lain dalam satu pertanyaan pilihan ganda. */
export const EXCLUSIVE = { areas: "TIDAK_ADA", priorTreatments: "BELUM", conditions: "TIDAK_ADA" } as const;

export const TEXT_LIMITS = { short: 100, long: 300, medication: 200, story: 1000 } as const;

export const MEASURE_LIMITS = {
  weightKg: { min: 30, max: 250 },
  heightCm: { min: 120, max: 220 },
  lostKg: { min: 0.5, max: 100 },
  exerciseMinutes: { min: 5, max: 300 },
  exercisePerWeek: { min: 1, max: 7 },
} as const;
