// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "../../prisma/seed";

describe("data awal katalog", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("membuat dua cabang dengan status yang benar", async () => {
    const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
    expect(branches).toHaveLength(2);
    expect(branches[0].slug).toBe("mahakeret");
    expect(branches[0].status).toBe("AKTIF");
    expect(branches[1].slug).toBe("citraland");
    expect(branches[1].status).toBe("SEGERA_HADIR");
  });

  it("membuat dokter penanggung jawab lengkap dengan gelarnya", async () => {
    const doctor = await prisma.doctor.findUnique({ where: { slug: "diane-paparang" } });
    // Gelar ikut disimpan di nama: ini tampil di halaman publik klinik
    // kesehatan, jadi kredensialnya harus tertulis utuh.
    expect(doctor?.name).toBe("Dr. Diane Paparang, Sp.GK, AIFO-K");
    expect(doctor?.specialty).toBe("Spesialis Gizi Klinik");
    expect(doctor?.isActive).toBe(true);
  });

  it("memuat harga HIFU Wajah sesuai materi promosi", async () => {
    const service = await prisma.service.findUnique({ where: { slug: "hifu-wajah" } });
    expect(service?.normalPrice).toBe(749000);
    expect(service?.promoPrice).toBe(499000);
  });

  it("menyimpan Botox dengan catatan satuan harga", async () => {
    const botox = await prisma.service.findUnique({ where: { slug: "botox" } });
    expect(botox?.promoPrice).toBe(50000);
    expect(botox?.normalPrice).toBeNull();
    expect(botox?.priceNote).toBe("/ unit");
  });

  it("menandai tepat empat layanan sebagai signature", async () => {
    const signature = await prisma.service.findMany({ where: { isSignature: true } });
    expect(signature.map((s) => s.slug).sort()).toEqual([
      "hifu-wajah",
      "peeling",
      "rf-wajah",
      "skin-booster-dna-salmon",
    ]);
  });

  it("memuat setiap layanan dengan harga promo lebih murah dari harga normal", async () => {
    // Harga coret yang lebih murah dari harga promo adalah salah ketik yang
    // memalukan di halaman publik. Dicegat di sini, bukan oleh pasien.
    const services = await prisma.service.findMany({ where: { normalPrice: { not: null } } });
    const wrong = services.filter((s) => s.normalPrice! <= s.promoPrice);
    expect(wrong.map((s) => s.slug)).toEqual([]);
  });

  it("membuat dua belas paket slimming dalam tiga kelompok", async () => {
    const packages = await prisma.package.findMany();
    expect(packages).toHaveLength(12);

    const maxSlim = await prisma.package.findUnique({
      where: { slug: "max-slim" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    expect(maxSlim?.monthlyPrice).toBe(1925000);
    expect(maxSlim?.items.map((i) => i.label)).toEqual([
      "Konsul & Timbang BIA",
      "Kapsul M",
      "Fat Blocker",
      "Inject S",
    ]);
  });

  it("memakai Kapsul L pada LUX T ACTIVE, bukan Kapsul M", async () => {
    // Materi promosi menulis "Kapsul M" di sini, tidak konsisten dengan paket
    // LUX lainnya. Dikoreksi sesuai keputusan D4 pada PRD.
    const luxTActive = await prisma.package.findUnique({
      where: { slug: "lux-t-active" },
      include: { items: true },
    });
    const labels = luxTActive?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("Kapsul L");
    expect(labels).not.toContain("Kapsul M");
  });

  it("memberi setiap paket kelompok yang dikenali", async () => {
    const packages = await prisma.package.findMany();
    const groups = new Set(packages.map((p) => p.groupName));
    expect([...groups].sort()).toEqual(["ACTIVE", "LUX", "MAX"]);
  });

  it("bersifat idempoten — dijalankan dua kali tidak menggandakan data", async () => {
    await seed();
    expect(await prisma.branch.count()).toBe(2);
    expect(await prisma.package.count()).toBe(12);
    expect(await prisma.packageItem.count()).toBe(
      (await prisma.package.findMany({ include: { items: true } })).reduce(
        (total, p) => total + p.items.length,
        0,
      ),
    );
  });
});
