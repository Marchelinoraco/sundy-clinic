// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(admin)/admin/laporan/unduh/route";
import { prisma } from "@/lib/db";
import { exportReportCsv } from "@/server/report-export";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor, session } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
  session: { signedIn: true },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    getCurrentStaff: vi.fn(async () => (session.signedIn ? actor : null)),
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "ekspor-laporan";
const WA = "6281200009004";
const MARCH = { from: "2035-03-01", to: "2035-03-31" };
const URL_BASE = "http://localhost/admin/laporan/unduh";

describe("ekspor laporan CSV", () => {
  let world: BillingWorld;
  let categoryId: string;

  async function clean() {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { contains: SLUG } } } });
    await prisma.expenseCategory.deleteMany({ where: { name: { contains: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { action: "report.export", summary: { contains: "2035-03-01 sampai 2035-03-31" } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    // Nama kategori berbahaya: diawali "=" agar sel CSV-nya harus dinetralkan.
    categoryId = (await prisma.expenseCategory.create({ data: { name: `=HACK() ${SLUG}` } })).id;
    await prisma.expense.create({
      data: { date: new Date("2035-03-10T00:00:00Z"), categoryId, amount: 123_000, createdById: "s1", createdByName: "Uji", branchId: world.branchId },
    });
    await prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        status: "FINAL",
        number: "TG-2035-9001",
        finalizedAt: new Date("2035-03-10T12:00:00+08:00"),
        createdById: "s1",
        createdByName: "Uji",
        lines: { create: [{ kind: "LAYANAN", name: "Konsultasi", quantity: 1, unitPrice: 400_000 }] },
      },
    });
  });
  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
    session.signedIn = true;
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("CSV: BOM, ringkasan, kategori berbahaya dinetralkan, nama berkas, dan audit tanpa data sensitif", async () => {
    const { filename, csv } = await exportReportCsv({ period: MARCH, branchId: world.branchId });
    expect(filename).toBe("laporan-untung-rugi-2035-03-01-2035-03-31.csv");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Laporan untung-rugi\r\n");
    expect(csv).toContain("Periode,2035-03-01,2035-03-31");
    expect(csv).toContain("Total pendapatan,400000");
    expect(csv).toContain("Pengeluaran,123000");
    expect(csv).toContain(`'=HACK() ${SLUG},123000`);
    expect(csv).not.toMatch(/(^|\r\n)=HACK/);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "report.export", summary: { contains: "2035-03-01 sampai 2035-03-31" } } });
    expect(audit.entity).toBe("Report");
    expect(audit.summary).toContain("2035-03-01");
  });

  it("periode tidak sah dan cabang yang tidak ada ditolak", async () => {
    await expect(exportReportCsv({ period: { from: "2035-03-10", to: "2035-03-01" }, branchId: null })).rejects.toThrow(
      "Tanggal dari tidak boleh setelah tanggal sampai.",
    );
    await expect(exportReportCsv({ period: MARCH, branchId: "tidak-ada" })).rejects.toThrow("Cabang tidak ditemukan.");
  });

  it("rute: 200 untuk Admin Keuangan dengan header unduhan", async () => {
    const response = await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31&cabang=${world.branchId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="laporan-untung-rugi-2035-03-01-2035-03-31.csv"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Total pendapatan,400000");
  });

  it("rute: 401 bila belum masuk, 403 untuk peran lain, 400 untuk periode atau cabang tidak sah", async () => {
    session.signedIn = false;
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31`))).status).toBe(401);
    session.signedIn = true;
    for (const role of ["RESEPSIONIS", "DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31`))).status).toBe(403);
    }
    actor.role = "SUPER_ADMIN";
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-31&sampai=2035-03-01`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?dari=2035-03-01&sampai=2035-03-31&cabang=tidak-ada`))).status).toBe(400);
    expect((await GET(new Request(URL_BASE))).status).toBe(400);
  });
});
