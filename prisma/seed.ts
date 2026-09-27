import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Seed memakai DATABASE_URL_UNPOOLED, bukan DATABASE_URL.
 *
 * Di Neon, DATABASE_URL adalah pooler mode transaksi yang tidak mendukung
 * transaksi batch seperti yang dipakai di bawah — percobaannya gagal dengan
 * "Unable to start a transaction in the given time". Di VPS kedua nilai sama
 * (PostgreSQL lokal), jadi pembedaan ini hanya berarti untuk Neon.
 */
function createSeedClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED belum diisi. Seed membutuhkan koneksi langsung ke PostgreSQL.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Seluruh harga di berkas ini disalin dari materi promosi klinik, yang
// ditranskrip ke PRD Lampiran A & B. Sumber kebenarannya adalah PRD.
// Harga dalam rupiah penuh, bukan ribuan dan bukan sen.

const branches = [
  {
    slug: "mahakeret",
    name: "SunDY Mahakeret",
    address: "Jl. Garuda No. 10, Mahakeret Barat, Manado, Sulawesi Utara",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–19.00",
    status: "AKTIF" as const,
    sortOrder: 1,
  },
  {
    slug: "citraland",
    name: "SunDY Citraland",
    address: "Citraland — Cluster The Manhattan, Manado, Sulawesi Utara",
    whatsapp: "6285172228900",
    openingHours: "Senin–Sabtu, 11.00–19.00",
    status: "SEGERA_HADIR" as const,
    sortOrder: 2,
  },
];

const staff = [
  {
    slug: "diane-paparang",
    name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
    role: "DOKTER" as const,
    specialty: "Spesialis Gizi Klinik",
    bio: "Dokter penanggung jawab SunDY Clinic Manado untuk program slimming, nutrisi, dan perawatan estetika.",
    showOnWebsite: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    // Jumlah terapis belum dikonfirmasi pemilik (keputusan D11 pada PRD).
    // Satu terapis dipakai sebagai data awal agar jalur jadwal terapis
    // dapat diuji sejak sekarang.
    slug: "terapis-mahakeret",
    name: "Terapis SunDY Mahakeret",
    role: "TERAPIS" as const,
    showOnWebsite: false,
    isActive: true,
    sortOrder: 2,
  },
];

const categories = [
  { slug: "facial", name: "Facial Treatment", sortOrder: 1 },
  { slug: "peeling", name: "Peeling", sortOrder: 2 },
  {
    slug: "rf",
    name: "RF Treatment",
    description: "Kulit lebih kencang, glowing & awet muda",
    sortOrder: 3,
  },
  { slug: "hifu", name: "HIFU Treatment", sortOrder: 4 },
  { slug: "botox", name: "Botox Treatment", sortOrder: 5 },
  {
    slug: "laser",
    name: "Laser Treatment",
    description: "Solusi kulit lebih sehat, cerah, dan glowing",
    sortOrder: 6,
  },
  { slug: "dermapen", name: "Dermapen Treatment", sortOrder: 7 },
  { slug: "elektrocauter", name: "Elektrocauter Treatment", sortOrder: 8 },
  { slug: "skin-booster", name: "Skin Booster", sortOrder: 9 },
  { slug: "vitamin-c", name: "Vitamin C", sortOrder: 10 },
  {
    slug: "slimming",
    name: "Slimming & Wellness",
    description: "Signature treatment dan layanan satuan program slimming",
    sortOrder: 11,
  },
];

type SeedService = {
  slug: string;
  name: string;
  description?: string;
  normalPrice?: number;
  promoPrice: number;
  priceNote?: string;
  durationMin?: number;
  isSignature?: boolean;
  /// Lihat keputusan D10 pada PRD — usulan awal, perlu dikonfirmasi pemilik.
  requiresDoctor?: boolean;
  categorySlug: string;
  sortOrder: number;
};

// "Our Signature Treatment" pada materi promosi bukan layanan tersendiri.
// Ia menyorot empat layanan yang sudah ada, jadi disimpan sebagai penanda
// isSignature, bukan sebagai baris duplikat dengan harga yang sama.
const services: SeedService[] = [
  // Facial
  {
    slug: "relaxing-facial",
    name: "Relaxing Facial",
    normalPrice: 189000,
    promoPrice: 149000,
    durationMin: 60,
    categorySlug: "facial",
    sortOrder: 1,
  },
  {
    slug: "facial-brightening",
    name: "Facial Brightening",
    normalPrice: 289000,
    promoPrice: 249000,
    durationMin: 60,
    categorySlug: "facial",
    sortOrder: 2,
  },
  {
    slug: "facial-acne",
    name: "Facial Acne",
    normalPrice: 289000,
    promoPrice: 249000,
    durationMin: 60,
    categorySlug: "facial",
    sortOrder: 3,
  },

  // Peeling
  {
    slug: "peeling",
    name: "Peeling",
    description:
      "Mengangkat sel kulit mati, membersihkan pori-pori, dan membantu kulit tampak lebih cerah, halus, dan sehat.",
    normalPrice: 149000,
    promoPrice: 99000,
    durationMin: 45,
    isSignature: true,
    categorySlug: "peeling",
    sortOrder: 1,
  },
  {
    slug: "peeling-premium",
    name: "Peeling Premium",
    description:
      "Perawatan peeling dengan formula premium untuk hasil yang lebih optimal, aman, nyaman, dan minim iritasi.",
    normalPrice: 349000,
    promoPrice: 299000,
    durationMin: 45,
    categorySlug: "peeling",
    sortOrder: 2,
  },
  {
    slug: "paket-peeling-premium",
    name: "Paket Peeling Premium",
    description: "Rangkaian tiga kali Peeling Premium.",
    promoPrice: 799000,
    priceNote: "/ 3x",
    durationMin: 45,
    categorySlug: "peeling",
    sortOrder: 3,
  },

  // RF
  {
    slug: "rf-perut",
    name: "RF Perut",
    description:
      "Mengencangkan kulit perut, mengurangi lemak lokal, dan membantu meratakan tekstur kulit sehingga perut terlihat lebih kencang dan ramping.",
    normalPrice: 749000,
    promoPrice: 499000,
    durationMin: 60,
    categorySlug: "rf",
    sortOrder: 1,
  },
  {
    slug: "rf-paha",
    name: "RF Paha",
    description:
      "Membantu mengencangkan kulit pada area paha, mengurangi lemak membandel, dan meningkatkan elastisitas kulit agar paha tampak lebih halus dan kencang.",
    normalPrice: 499000,
    promoPrice: 329000,
    durationMin: 60,
    categorySlug: "rf",
    sortOrder: 2,
  },
  {
    slug: "rf-lengan",
    name: "RF Lengan",
    description:
      "Mengencangkan kulit lengan yang kendur, mengurangi lemak berlebih, dan membantu membentuk lengan agar terlihat lebih kencang dan ideal.",
    normalPrice: 389000,
    promoPrice: 289000,
    durationMin: 45,
    categorySlug: "rf",
    sortOrder: 3,
  },
  {
    slug: "rf-wajah",
    name: "RF Wajah",
    description:
      "Merangsang produksi kolagen, mengencangkan kulit wajah, mengurangi garis halus, dan membantu kulit tampak lebih cerah, halus, serta awet muda.",
    normalPrice: 389000,
    promoPrice: 289000,
    durationMin: 45,
    isSignature: true,
    categorySlug: "rf",
    sortOrder: 4,
  },

  // HIFU
  {
    slug: "hifu-wajah",
    requiresDoctor: true,
    name: "HIFU Wajah",
    description: "Mengencangkan kulit dan mengurangi garis halus.",
    normalPrice: 749000,
    promoPrice: 499000,
    durationMin: 90,
    isSignature: true,
    categorySlug: "hifu",
    sortOrder: 1,
  },
  {
    slug: "hifu-miss-v",
    requiresDoctor: true,
    name: "HIFU Miss V",
    normalPrice: 649000,
    promoPrice: 489000,
    durationMin: 60,
    categorySlug: "hifu",
    sortOrder: 2,
  },
  {
    slug: "hifu-perut",
    requiresDoctor: true,
    name: "HIFU Perut",
    normalPrice: 1000000,
    promoPrice: 699000,
    durationMin: 90,
    categorySlug: "hifu",
    sortOrder: 3,
  },

  // Botox
  {
    slug: "botox",
    requiresDoctor: true,
    name: "Botox",
    promoPrice: 50000,
    priceNote: "/ unit",
    durationMin: 30,
    categorySlug: "botox",
    sortOrder: 1,
  },

  // Laser
  {
    slug: "laser-rejuve-fleck",
    requiresDoctor: true,
    name: "Laser Rejuve / Fleck",
    description:
      "Merangsang regenerasi kulit, memudarkan flek hitam, bekas jerawat, dan membuat kulit tampak lebih cerah dan merata.",
    normalPrice: 849000,
    promoPrice: 399000,
    durationMin: 45,
    categorySlug: "laser",
    sortOrder: 1,
  },
  {
    slug: "laser-2-in-1",
    requiresDoctor: true,
    name: "Laser 2 in 1",
    description:
      "Perawatan laser kombinasi untuk mengatasi berbagai masalah kulit seperti pori-pori besar, bekas jerawat, dan tekstur kulit tidak merata.",
    normalPrice: 1000000,
    promoPrice: 599000,
    durationMin: 60,
    categorySlug: "laser",
    sortOrder: 2,
  },
  {
    slug: "lip-laser",
    requiresDoctor: true,
    name: "Lip Laser",
    description:
      "Mencerahkan warna bibir, mengurangi bibir gelap, dan membuat bibir tampak lebih sehat, cerah, dan merona alami.",
    normalPrice: 249000,
    promoPrice: 99000,
    durationMin: 30,
    categorySlug: "laser",
    sortOrder: 3,
  },

  // Dermapen
  {
    slug: "dermapen",
    requiresDoctor: true,
    name: "Dermapen",
    description:
      "Merangsang produksi kolagen alami, memperbaiki tekstur kulit, mengurangi bekas jerawat, dan membantu penyerapan skincare lebih optimal.",
    normalPrice: 749000,
    promoPrice: 589000,
    durationMin: 60,
    categorySlug: "dermapen",
    sortOrder: 1,
  },
  {
    slug: "dermapen-prp",
    requiresDoctor: true,
    name: "Dermapen PRP",
    description:
      "Kombinasi dermapen dengan PRP (Platelet Rich Plasma) untuk regenerasi kulit lebih cepat, kulit tampak lebih cerah, sehat, dan awet muda.",
    normalPrice: 1189000,
    promoPrice: 898000,
    durationMin: 90,
    categorySlug: "dermapen",
    sortOrder: 2,
  },

  // Elektrocauter
  {
    slug: "elektrocauter",
    requiresDoctor: true,
    name: "Elektrocauter",
    description:
      "Menghilangkan skin tag, milia, kutil, atau verruca dengan teknologi elektrocauter yang aman, cepat, dan minim rasa sakit dengan hasil optimal.",
    normalPrice: 248000,
    promoPrice: 188000,
    durationMin: 30,
    categorySlug: "elektrocauter",
    sortOrder: 1,
  },

  // Skin Booster
  {
    slug: "skin-booster-ha",
    requiresDoctor: true,
    name: "Skin Booster HA",
    description:
      "Melembapkan kulit secara intens, meningkatkan elastisitas dan membuat kulit lebih kenyal dan sehat.",
    normalPrice: 3890000,
    promoPrice: 3589000,
    durationMin: 60,
    categorySlug: "skin-booster",
    sortOrder: 1,
  },
  {
    slug: "skin-booster-dna-salmon",
    requiresDoctor: true,
    name: "Skin Booster DNA Salmon",
    description:
      "Membantu regenerasi sel kulit, memperbaiki tekstur kulit, mencerahkan, dan mengurangi tanda-tanda penuaan.",
    normalPrice: 989000,
    promoPrice: 889000,
    durationMin: 60,
    isSignature: true,
    categorySlug: "skin-booster",
    sortOrder: 2,
  },
  {
    slug: "eyebooster",
    requiresDoctor: true,
    name: "Eyebooster",
    description:
      "Perawatan khusus area mata untuk mengurangi kerutan, mata panda, dan membuat tampilan mata lebih segar dan bercahaya.",
    normalPrice: 2389000,
    promoPrice: 2189000,
    durationMin: 45,
    categorySlug: "skin-booster",
    sortOrder: 3,
  },

  // Vitamin C — lihat keputusan D3 pada PRD, angka ini perlu konfirmasi pemilik.
  {
    slug: "injek-vitamin-c-2000mg",
    requiresDoctor: true,
    name: "Injek Vit. C 2000mg",
    description:
      "Membantu mencerahkan kulit, meningkatkan produksi kolagen, dan melindungi kulit dari radikal bebas.",
    normalPrice: 1449000,
    promoPrice: 1299000,
    durationMin: 30,
    categorySlug: "vitamin-c",
    sortOrder: 1,
  },
  {
    slug: "injek-vitamin-c-1100mg",
    requiresDoctor: true,
    name: "Injek Vit. C 1100mg",
    description:
      "Membantu menjaga kesehatan kulit, membuat kulit tampak lebih cerah, segar, dan bercahaya.",
    normalPrice: 1249000,
    promoPrice: 1199000,
    durationMin: 30,
    categorySlug: "vitamin-c",
    sortOrder: 2,
  },
  {
    slug: "infus-vitamin-c-1100mg",
    requiresDoctor: true,
    name: "Infus Vit. C 1100mg",
    description:
      "Membantu meningkatkan daya tahan tubuh, meredakan kelelahan, dan membuat kulit tampak lebih sehat.",
    normalPrice: 1499000,
    promoPrice: 1299000,
    durationMin: 60,
    categorySlug: "vitamin-c",
    sortOrder: 3,
  },
  {
    slug: "infus-vitamin-c-2000mg",
    requiresDoctor: true,
    name: "Infus Vit. C 2000mg",
    description:
      "Dosis tinggi untuk hasil maksimal dalam mencerahkan kulit, meningkatkan imunitas, dan melawan radikal bebas.",
    normalPrice: 1699000,
    promoPrice: 1499000,
    durationMin: 60,
    categorySlug: "vitamin-c",
    sortOrder: 4,
  },

  // Slimming & Wellness
  {
    slug: "meso-treatment",
    requiresDoctor: true,
    name: "Meso Treatment",
    description: "Signature treatment untuk slimming.",
    promoPrice: 550000,
    priceNote: "/ 5 titik",
    durationMin: 45,
    categorySlug: "slimming",
    sortOrder: 1,
  },
  {
    slug: "konsultasi-dokter",
    requiresDoctor: true,
    name: "Konsultasi Dokter",
    description: "Analisa kondisi dan rekomendasi program terbaik untuk Anda.",
    promoPrice: 200000,
    durationMin: 30,
    categorySlug: "slimming",
    sortOrder: 2,
  },
  {
    slug: "timbang-bia",
    name: "Timbang BIA",
    description:
      "Pengukuran komposisi tubuh: berat badan, massa lemak, massa otot, dan lemak visceral.",
    promoPrice: 350000,
    durationMin: 20,
    categorySlug: "slimming",
    sortOrder: 3,
  },
  {
    slug: "meal-plan",
    requiresDoctor: true,
    name: "Meal Plan",
    description: "Rencana makan yang disusun sesuai kondisi dan target Anda.",
    promoPrice: 300000,
    durationMin: 30,
    categorySlug: "slimming",
    sortOrder: 4,
  },
];

type SeedPackage = {
  slug: string;
  name: string;
  groupName: string;
  monthlyPrice: number;
  items: string[];
  sortOrder: number;
};

const BIA = "Konsul & Timbang BIA";

const packages: SeedPackage[] = [
  {
    slug: "max",
    name: "MAX",
    groupName: "MAX",
    monthlyPrice: 1125000,
    items: [BIA, "Kapsul M", "Fat Blocker"],
    sortOrder: 1,
  },
  {
    slug: "max-slim",
    name: "MAX SLIM",
    groupName: "MAX",
    monthlyPrice: 1925000,
    items: [BIA, "Kapsul M", "Fat Blocker", "Inject S"],
    sortOrder: 2,
  },
  {
    slug: "max-t",
    name: "MAX T",
    groupName: "MAX",
    monthlyPrice: 2525000,
    items: [BIA, "Kapsul M", "Fat Blocker", "Inject T"],
    sortOrder: 3,
  },

  {
    slug: "lux",
    name: "LUX",
    groupName: "LUX",
    monthlyPrice: 1500000,
    items: [BIA, "Kapsul L", "Fat Blocker"],
    sortOrder: 4,
  },
  {
    slug: "lux-slim",
    name: "LUX SLIM",
    groupName: "LUX",
    monthlyPrice: 2300000,
    items: [BIA, "Kapsul L", "Fat Blocker", "Inject S"],
    sortOrder: 5,
  },
  {
    slug: "lux-t",
    name: "LUX T",
    groupName: "LUX",
    monthlyPrice: 2900000,
    items: [BIA, "Kapsul L", "Fat Blocker", "Inject T"],
    sortOrder: 6,
  },

  {
    slug: "max-active",
    name: "MAX ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 1125000,
    items: [BIA, "Kapsul M", "Fat Burner"],
    sortOrder: 7,
  },
  {
    slug: "max-slim-active",
    name: "MAX SLIM ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 1925000,
    items: [BIA, "Kapsul M", "Fat Burner", "Inject S"],
    sortOrder: 8,
  },
  {
    slug: "max-t-active",
    name: "MAX T ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 2525000,
    items: [BIA, "Kapsul M", "Fat Burner", "Inject T"],
    sortOrder: 9,
  },
  {
    slug: "lux-active",
    name: "LUX ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 1500000,
    items: [BIA, "Kapsul L", "Fat Burner"],
    sortOrder: 10,
  },
  {
    slug: "lux-slim-active",
    name: "LUX SLIM ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 2300000,
    items: [BIA, "Kapsul L", "Fat Burner", "Inject S"],
    sortOrder: 11,
  },
  {
    // Materi promosi menulis "Kapsul M" di sini, tidak konsisten dengan paket
    // LUX lainnya. Dikoreksi menjadi Kapsul L sesuai keputusan D4 pada PRD.
    slug: "lux-t-active",
    name: "LUX T ACTIVE",
    groupName: "ACTIVE",
    monthlyPrice: 2900000,
    items: [BIA, "Kapsul L", "Fat Burner", "Inject T"],
    sortOrder: 12,
  },
];

const products = [
  {
    slug: "kapsul-m",
    name: "Kapsul M",
    description:
      "Kapsul program slimming paket MAX. Penggunaan sesuai anjuran dokter.",
    sortOrder: 1,
  },
  {
    slug: "kapsul-l",
    name: "Kapsul L",
    description:
      "Kapsul program slimming paket LUX. Penggunaan sesuai anjuran dokter.",
    sortOrder: 2,
  },
  {
    slug: "fat-blocker",
    name: "Fat Blocker",
    description: "Membantu menghambat penyerapan lemak dari makanan.",
    sortOrder: 3,
  },
  {
    slug: "fat-burner",
    name: "Fat Burner",
    description: "Membantu meningkatkan pembakaran lemak pada program ACTIVE.",
    sortOrder: 4,
  },
];

type SeedHoliday = { date: string; name: string; kind: "LIBUR_NASIONAL" | "CUTI_BERSAMA" };

// Sumber: SKB 3 Menteri Nomor 1497 Tahun 2025, Nomor 2 Tahun 2025, Nomor 5
// Tahun 2025 (Menteri Agama, Menteri Ketenagakerjaan, MenPAN-RB), ditetapkan
// 19 September 2025. 17 hari libur nasional + 8 cuti bersama, setiap tanggal
// dicocokkan terhadap hari dalam minggu sebelum dimuat.
const holidays2026: SeedHoliday[] = [
  { date: "2026-01-01", name: "Tahun Baru 2026 Masehi", kind: "LIBUR_NASIONAL" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad SAW", kind: "LIBUR_NASIONAL" },
  { date: "2026-02-16", name: "Cuti Bersama Tahun Baru Imlek", kind: "CUTI_BERSAMA" },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-18", name: "Cuti Bersama Hari Suci Nyepi", kind: "CUTI_BERSAMA" },
  { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-20", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-03-21", name: "Idul Fitri 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-22", name: "Idul Fitri 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-03-23", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-03-24", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA" },
  { date: "2026-04-03", name: "Wafat Yesus Kristus", kind: "LIBUR_NASIONAL" },
  { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-01", name: "Hari Buruh Internasional", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-14", name: "Kenaikan Yesus Kristus", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-15", name: "Cuti Bersama Kenaikan Yesus Kristus", kind: "CUTI_BERSAMA" },
  { date: "2026-05-27", name: "Idul Adha 1447 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-05-28", name: "Cuti Bersama Idul Adha", kind: "CUTI_BERSAMA" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE", kind: "LIBUR_NASIONAL" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila", kind: "LIBUR_NASIONAL" },
  { date: "2026-06-16", name: "1 Muharram Tahun Baru Islam 1448 Hijriah", kind: "LIBUR_NASIONAL" },
  { date: "2026-08-17", name: "Proklamasi Kemerdekaan", kind: "LIBUR_NASIONAL" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad SAW", kind: "LIBUR_NASIONAL" },
  { date: "2026-12-24", name: "Cuti Bersama Kelahiran Yesus Kristus", kind: "CUTI_BERSAMA" },
  { date: "2026-12-25", name: "Kelahiran Yesus Kristus", kind: "LIBUR_NASIONAL" },
];

/**
 * Memuat katalog klinik. Aman dijalankan berulang kali.
 *
 * Operasi dikelompokkan ke dalam beberapa transaksi alih-alih satu upsert per
 * baris. Basis datanya berada di Singapura, jadi satu upsert per baris berarti
 * sekitar delapan puluh perjalanan jaringan dan seed memakan belasan detik.
 * Dikelompokkan begini, jumlahnya turun menjadi segelintir.
 */
export async function seed(): Promise<void> {
  const prisma = createSeedClient();

  // Batas transaksi Prisma bawaan (maxWait 2 detik, timeout 5 detik) cukup
  // untuk PostgreSQL lokal di VPS, tetapi tidak untuk Neon Singapura dari laptop
  // pengembang. Diukur 26 Sep 2026 lewat port 5432: median 104 ms per kueri,
  // namun ±14% kueri tertahan > 0,8 detik (hingga 3,6 detik), dan membuka
  // koneksi baru 1–6 detik. Transaksi pertama berisi ±45 kueri berurutan, jadi
  // batasnya dibuat longgar agar seed uji tidak gagal hanya karena jaringan.
  const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 60_000 };

  try {
    await prisma.$transaction(
      [
        ...branches.map((branch) =>
          prisma.branch.upsert({
            where: { slug: branch.slug },
            update: branch,
            create: branch,
          }),
        ),
        ...staff.map((person) =>
          prisma.staff.upsert({
            where: { slug: person.slug },
            update: person,
            create: person,
          }),
        ),
        ...categories.map((category) =>
          prisma.serviceCategory.upsert({
            where: { slug: category.slug },
            update: category,
            create: category,
          }),
        ),
        ...products.map((product) =>
          prisma.product.upsert({
            where: { slug: product.slug },
            update: product,
            create: product,
          }),
        ),
        ...holidays2026.map((h) =>
          prisma.holiday.upsert({
            where: { date: new Date(`${h.date}T00:00:00Z`) },
            update: { name: h.name, kind: h.kind },
            create: { date: new Date(`${h.date}T00:00:00Z`), name: h.name, kind: h.kind },
          }),
        ),
      ],
      TRANSACTION_OPTIONS,
    );

    const categoryRows = await prisma.serviceCategory.findMany({
      select: { id: true, slug: true },
    });
    const categoryIdBySlug = new Map(
      categoryRows.map((row) => [row.slug, row.id]),
    );

    await prisma.$transaction(
      services.map(({ categorySlug, ...service }) => {
        const categoryId = categoryIdBySlug.get(categorySlug);
        if (!categoryId) {
          throw new Error(
            `Kategori "${categorySlug}" tidak ditemukan untuk layanan "${service.slug}"`,
          );
        }
        const data = { ...service, categoryId };
        return prisma.service.upsert({
          where: { slug: service.slug },
          update: data,
          create: data,
        });
      }),
      TRANSACTION_OPTIONS,
    );

    await prisma.$transaction(
      // Isi paket ditangani terpisah di bawah, jadi di sini hanya kolom paketnya.
      packages.map(({ slug, name, groupName, monthlyPrice, sortOrder }) =>
        prisma.package.upsert({
          where: { slug },
          update: { name, groupName, monthlyPrice, sortOrder },
          create: { slug, name, groupName, monthlyPrice, sortOrder },
        }),
      ),
      TRANSACTION_OPTIONS,
    );

    const packageRows = await prisma.package.findMany({
      select: { id: true, slug: true },
    });
    const packageIdBySlug = new Map(
      packageRows.map((row) => [row.slug, row.id]),
    );

    // Isi paket ditulis ulang seluruhnya agar perubahan susunan tercermin tanpa
    // menggandakan baris.
    await prisma.$transaction(
      [
        prisma.packageItem.deleteMany({
          where: { packageId: { in: [...packageIdBySlug.values()] } },
        }),
        prisma.packageItem.createMany({
          data: packages.flatMap((pkg) => {
            const packageId = packageIdBySlug.get(pkg.slug);
            if (!packageId) {
              throw new Error(`Paket "${pkg.slug}" gagal dibuat`);
            }
            return pkg.items.map((label, index) => ({
              packageId,
              label,
              sortOrder: index + 1,
            }));
          }),
        }),
      ],
      TRANSACTION_OPTIONS,
    );

    const mahakeret = await prisma.branch.findUniqueOrThrow({ where: { slug: "mahakeret" } });
    const diane = await prisma.staff.findUniqueOrThrow({ where: { slug: "diane-paparang" } });

    // Senin(1)-Sabtu(6), 11.00-19.00 WITA (660-1140 menit), slot 30 menit.
    await prisma.$transaction(
      [1, 2, 3, 4, 5, 6].map((weekday) =>
        prisma.scheduleTemplate.upsert({
          where: { staffId_weekday: { staffId: diane.id, weekday } },
          update: { branchId: mahakeret.id, startMinute: 660, endMinute: 1140, slotMinutes: 30 },
          create: {
            staffId: diane.id,
            branchId: mahakeret.id,
            weekday,
            startMinute: 660,
            endMinute: 1140,
            slotMinutes: 30,
          },
        }),
      ),
      TRANSACTION_OPTIONS,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Dijalankan hanya saat berkas ini dipanggil langsung lewat `npm run db:seed`,
// bukan saat diimpor oleh berkas uji.
const entry = process.argv[1];
const isDirectRun =
  entry !== undefined && import.meta.url === pathToFileURL(entry).href;

if (isDirectRun) {
  seed()
    .then(() => console.log("Data awal selesai dimuat."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
