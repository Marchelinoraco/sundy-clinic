/**
 * Kuis pendaftaran versi 1 — satu-satunya tempat kata-kata pilihan kuis.
 *
 * Kunci (mis. "TURUN_BERAT") yang disimpan di basis data; label hanya untuk
 * tampilan. Mengubah arti pilihan atau menambah pertanyaan berarti membuat
 * versi baru (src/lib/kuis/v2/…) agar isian lama tetap tampil dengan
 * pertanyaan aslinya (spec pendaftaran pasien 5.2).
 */
export const QUIZ_VERSION = 1;

export const PATIENT_TYPES = { BARU: "Belum, ini pertama kali", LAMA: "Sudah pernah" } as const;

export const PURPOSES = {
  SLIMMING: "Slimming",
  AESTHETIC: "Aesthetic",
  BELUM_YAKIN: "Belum yakin, tanya dokter saja",
} as const;

export const PURPOSE_HINTS = {
  SLIMMING: "Berat badan & bentuk tubuh",
  AESTHETIC: "Kulit & wajah",
  BELUM_YAKIN: "Ceritakan keluhan Anda, dokter yang menentukan",
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

export const MEALS = {
  pagi: "Pagi",
  siang: "Siang",
  malam: "Malam",
  snack: "Snack",
  minuman: "Minuman",
  cemilan: "Cemilan",
} as const;

/** Minimal satu dari ketiganya wajib terisi pada food recall. */
export const MAIN_MEALS = ["pagi", "siang", "malam"] as const;

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

export const ACTIVITY_KINDS = {
  MAKAN_MINUM: "Makan/minum",
  KAPSUL_OBAT: "Kapsul/obat",
  OLAHRAGA: "Olahraga",
} as const;

/** Tabel aktivitas yang dilihat dokter: 06.00 sampai 22.00, per jam. */
export const ACTIVITY_FIRST_HOUR = 6;
export const ACTIVITY_LAST_HOUR = 22;

/** Pilihan yang meniadakan pilihan lain dalam satu pertanyaan pilihan ganda. */
export const EXCLUSIVE = { areas: "TIDAK_ADA", priorTreatments: "BELUM", conditions: "TIDAK_ADA" } as const;

export const TEXT_LIMITS = { short: 100, long: 300, medication: 200, activity: 200, story: 1000 } as const;

export const MEASURE_LIMITS = {
  weightKg: { min: 30, max: 250 },
  heightCm: { min: 120, max: 220 },
  lostKg: { min: 0.5, max: 100 },
} as const;
