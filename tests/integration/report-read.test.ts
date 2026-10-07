// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { discountAmount, invoiceTotals } from "@/lib/invoice";
import { monthPeriod, trendMonths } from "@/lib/report";
import { getMonthProfit, getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER" | "TERAPIS";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Keuangan Uji", role: "ADMIN_KEUANGAN" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-laporan";
const WA = "6281200009002";
/** Waktu WITA (UTC+8). */
const at = (date: string, time = "12:00") => new Date(`${date}T${time}:00+08:00`);
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const MARCH = { from: "2035-03-01", to: "2035-03-31" };
const NOW = at("2035-03-15");

describe("laporan untung-rugi", () => {
  let world: BillingWorld;
  let otherBranchId: string;
  let sewa: string;
  let gaji: string;
  let retired: string;
  let seq = 0;
  const appointmentIds: string[] = [];

  async function invoice(input: {
    status?: "FINAL" | "DRAF" | "DIBATALKAN";
    finalizedAt?: Date;
    branchId?: string;
    lines: { kind: "LAYANAN" | "TREATMENT" | "BARANG"; quantity: number; unitPrice: number; cost?: number }[];
    discount?: number;
    discountKind?: "NOMINAL" | "PERSEN";
    payments?: { amount: number; paidAt: string; revoked?: boolean }[];
  }) {
    const status = input.status ?? "FINAL";
    seq += 1;
    return prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: input.branchId ?? world.branchId,
        status,
        number: status === "DRAF" ? null : `TG-2035-${String(seq).padStart(4, "0")}`,
        finalizedAt: status === "FINAL" ? (input.finalizedAt ?? at("2035-03-10")) : null,
        cancelledAt: status === "DIBATALKAN" ? new Date() : null,
        discountKind: input.discount ? (input.discountKind ?? "NOMINAL") : null,
        discountValue: input.discount ?? 0,
        discountReason: input.discount ? "Uji" : null,
        createdById: "s1",
        createdByName: "Uji",
        lines: {
          create: input.lines.map((line, index) => ({
            kind: line.kind,
            name: `Baris ${index}`,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            sortOrder: index,
            ...(line.kind === "BARANG"
              ? { itemId: world.drugId, stockUses: { create: [{ batchId: "batch-uji", quantity: line.quantity, unitCost: line.cost ?? 0 }] } }
              : {}),
          })),
        },
        payments: {
          create: (input.payments ?? []).map((p) => ({
            amount: p.amount,
            method: "TUNAI" as const,
            paidAt: day(p.paidAt),
            staffId: "s1",
            staffName: "Uji",
            ...(p.revoked ? { revokedAt: new Date(), revokedByName: "Uji", revokeReason: "Salah" } : {}),
          })),
        },
      },
      select: { id: true },
    });
  }

  const expense = (date: string, categoryId: string, amount: number, extra: Record<string, unknown> = {}) =>
    prisma.expense.create({
      data: { date: day(date), categoryId, amount, createdById: "s1", createdByName: "Uji", branchId: world.branchId, ...extra },
    });

  const verify = (appointmentId: string, date: string) =>
    prisma.auditLog.create({
      data: { actorStaffId: "s1", actorName: "Uji", actorRole: "ADMIN_KEUANGAN", action: "appointment.verify", entity: "Appointment", entityId: appointmentId, createdAt: at(date) },
    });

  async function clean() {
    await prisma.auditLog.deleteMany({ where: { action: "appointment.verify", entityId: { in: appointmentIds } } });
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.expense.deleteMany({ where: { category: { name: { startsWith: SLUG } } } });
    await prisma.branch.deleteMany({ where: { slug: `${SLUG}-b2` } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: SLUG } } });
  }

  beforeAll(async () => {
    await clean();
    world = await createBillingWorld(SLUG, WA);
    otherBranchId = (
      await prisma.branch.create({
        data: { slug: `${SLUG}-b2`, name: `Cabang ${SLUG} dua`, address: "Jl. Uji", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF", sortOrder: 92 },
      })
    ).id;
    sewa = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Sewa`, sortOrder: 1 } })).id;
    gaji = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Gaji`, sortOrder: 2 } })).id;
    retired = (await prisma.expenseCategory.create({ data: { name: `${SLUG} Lama`, sortOrder: 3, isActive: false } })).id;

    // Tagihan Maret 2035 (cabang uji).
    await invoice({
      lines: [
        { kind: "LAYANAN", quantity: 1, unitPrice: 1_000_000 },
        { kind: "TREATMENT", quantity: 2, unitPrice: 250_000 },
        { kind: "BARANG", quantity: 3, unitPrice: 100_000, cost: 40_000 },
      ],
      discount: 100_000,
      payments: [
        { amount: 1_200_000, paidAt: "2035-03-12" },
        { amount: 500_000, paidAt: "2035-03-12", revoked: true },
      ],
    }); // total 1.700.000, dibayar 1.200.000, belum tertagih 500.000
    await invoice({ finalizedAt: at("2035-03-31", "23:59"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 200_000 }] });
    await invoice({ finalizedAt: at("2035-04-01", "00:00"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 999_999 }] }); // di luar: April
    await invoice({ finalizedAt: at("2035-02-28", "23:59"), lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 321_000 }] }); // Februari
    await invoice({ status: "DIBATALKAN", lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 777_777 }] });
    await invoice({ status: "DRAF", lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 555_555 }] });
    await invoice({
      branchId: otherBranchId,
      lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 5_000_000 }],
      payments: [{ amount: 1_000_000, paidAt: "2035-03-20" }],
    }); // cabang lain: belum tertagih 4.000.000

    // Pembayaran di muka: booking diverifikasi.
    const klinik1 = await finalVisit(world);
    const online = await finalVisit(world, { channel: "ONLINE", treatments: [] });
    const klinik2 = await finalVisit(world);
    const klinik3 = await finalVisit(world);
    appointmentIds.push(klinik1.appointmentId, online.appointmentId, klinik2.appointmentId, klinik3.appointmentId);
    await prisma.appointment.updateMany({ where: { id: { in: appointmentIds } }, data: { bookingFee: 100_000 } });
    await verify(klinik1.appointmentId, "2035-03-05");
    await verify(online.appointmentId, "2035-03-08");
    await verify(online.appointmentId, "2035-03-09"); // diverifikasi dua kali: dihitung sekali
    await verify(klinik2.appointmentId, "2035-02-20"); // pertama kali di Februari
    await verify(klinik2.appointmentId, "2035-03-15"); // diverifikasi ulang di Maret: tidak dihitung lagi
    await verify(klinik3.appointmentId, "2035-04-03"); // April

    // Juni 2035 (di luar jendela tren): diskon persen bulat ke bawah dan nominal yang melebihi subtotal.
    await invoice({
      finalizedAt: at("2035-06-10"),
      lines: [{ kind: "LAYANAN", quantity: 1, unitPrice: 333_335 }],
      discount: 33,
      discountKind: "PERSEN",
      payments: [{ amount: 100_000, paidAt: "2035-06-11" }],
    }); // diskon floor(333.335 × 33 / 100) = 110.000
    await invoice({
      finalizedAt: at("2035-06-20", "23:59"),
      lines: [{ kind: "BARANG", quantity: 2, unitPrice: 50_000, cost: 12_345 }],
      discount: 900_000,
    }); // diskon nominal dibatasi subtotal 100.000; harga pokok 24.690

    // Pengeluaran.
    await expense("2035-03-02", sewa, 400_000);
    await expense("2035-03-25", gaji, 600_000);
    await expense("2035-03-26", sewa, 999_999, { voidedAt: new Date(), voidedByName: "Uji", voidReason: "Salah" });
    await expense("2035-03-20", gaji, 70_000, { branchId: null }); // umum
    await expense("2035-03-21", sewa, 30_000, { branchId: otherBranchId });
    await expense("2035-04-01", sewa, 5_000);

    // Pembayaran hutang supplier.
    const purchase = await prisma.purchaseInvoice.create({
      data: {
        supplierId: world.supplierId,
        branchId: world.branchId,
        invoiceNumber: "SPR-1",
        invoiceDate: day("2035-03-01"),
        dueDate: day("2035-04-01"),
        total: 1_000_000,
        createdById: "s1",
        createdByName: "Uji",
      },
    });
    const supplierPayment = (kind: "BAYAR" | "PENGEMBALIAN", amount: number, paidAt: string, revoked = false) =>
      prisma.supplierPayment.create({
        data: {
          invoiceId: purchase.id,
          kind,
          amount,
          method: "TRANSFER",
          paidAt: day(paidAt),
          staffId: "s1",
          staffName: "Uji",
          ...(revoked ? { revokedAt: new Date(), revokedByName: "Uji", revokeReason: "Salah" } : {}),
        },
      });
    await supplierPayment("BAYAR", 300_000, "2035-03-10");
    await supplierPayment("BAYAR", 100_000, "2035-03-11", true);
    await supplierPayment("PENGEMBALIAN", 50_000, "2035-03-15");
    await supplierPayment("BAYAR", 77_000, "2035-04-02");
  });

  beforeEach(() => {
    actor.role = "ADMIN_KEUANGAN";
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("satu cabang: pendapatan, harga pokok, pengeluaran, laba, dan belum tertagih", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(report.branchName).toBe((await prisma.branch.findUniqueOrThrow({ where: { id: world.branchId } })).name);
    expect(report.current.totals).toEqual({
      service: 1_200_000,
      treatment: 500_000,
      goods: 300_000,
      discount: 100_000,
      upfront: 450_000, // biaya booking 200.000 + Konsultasi Online 250.000
      revenue: 2_350_000,
      cogs: 120_000,
      grossProfit: 2_230_000,
      expenses: 1_000_000, // yang dibatalkan, umum, cabang lain, dan April tidak ikut
      netProfit: 1_230_000,
      outstanding: 700_000,
    });
    expect(report.current.invoiceCount).toBe(2);
    expect(report.current.upfrontFee).toBe(200_000);
    expect(report.current.upfrontOnline).toBe(250_000);
    expect(report.current.expensesByCategory.map((c) => [c.name, c.amount])).toEqual([[`${SLUG} Sewa`, 400_000], [`${SLUG} Gaji`, 600_000]]);
  });

  it("arus kas: pembayaran customer yang berlaku + di muka; hutang supplier neto + pengeluaran; laba tidak berubah karenanya", async () => {
    const { current } = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(current.cash).toEqual({
      customer: 1_200_000, // yang dibatalkan dan di cabang lain tidak ikut
      upfront: 450_000,
      inflow: 1_650_000,
      supplier: 250_000, // 300.000 bayar − 50.000 pengembalian; yang dibatalkan dan April tidak ikut
      expenses: 1_000_000,
      outflow: 1_250_000,
      net: 400_000,
    });
    expect(current.totals.netProfit).toBe(current.totals.grossProfit - current.totals.expenses);
  });

  it("semua cabang: ikut tagihan cabang lain, pengeluaran cabang lain, dan pengeluaran umum", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: null }, NOW);
    expect(report.branchName).toBe("Semua cabang");
    expect(report.current.totals).toMatchObject({
      service: 6_200_000,
      revenue: 7_350_000,
      cogs: 120_000,
      expenses: 1_100_000, // 400.000 + 600.000 + umum 70.000 + cabang lain 30.000
      outstanding: 4_700_000,
    });
    expect(report.current.cash.customer).toBe(2_200_000);
    expect(report.current.invoiceCount).toBe(3);
  });

  it("batas hari WITA: 23.59 tanggal terakhir ikut, 00.00 hari berikutnya dan 23.59 sebelum periode tidak", async () => {
    const lastDay = await getProfitReport({ period: { from: "2035-03-31", to: "2035-03-31" }, branchId: world.branchId }, NOW);
    expect(lastDay.current.totals.revenue).toBe(200_000);
    const firstApril = await getProfitReport({ period: { from: "2035-04-01", to: "2035-04-01" }, branchId: world.branchId }, NOW);
    expect(firstApril.current.totals.service).toBe(999_999);
    const lastFeb = await getProfitReport({ period: { from: "2035-02-28", to: "2035-02-28" }, branchId: world.branchId }, NOW);
    expect(lastFeb.current.totals.service).toBe(321_000);
  });

  it("pendapatan di muka: diverifikasi dua kali dihitung sekali; dihitung di periode verifikasi pertamanya", async () => {
    const march = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(march.current.upfrontFee).toBe(200_000); // klinik1 + online; klinik2 (Februari) dan klinik3 (April) tidak
    const feb = await getProfitReport({ period: { from: "2035-02-01", to: "2035-02-28" }, branchId: world.branchId }, NOW);
    expect(feb.current.upfrontFee).toBe(100_000); // klinik2
    expect(feb.current.upfrontOnline).toBe(0);
    const april = await getProfitReport({ period: { from: "2035-04-01", to: "2035-04-30" }, branchId: world.branchId }, NOW);
    expect(april.current.upfrontFee).toBe(100_000); // klinik3
  });

  it("perbandingan dengan bulan sebelumnya dan tren 12 bulan", async () => {
    const report = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    expect(report.previousPeriod).toEqual({ from: "2035-02-01", to: "2035-02-28" });
    expect(report.previous.totals).toMatchObject({ service: 321_000, upfront: 100_000, revenue: 421_000, expenses: 0, netProfit: 421_000 });
    expect(report.comparison.revenue).toEqual({ amount: 1_929_000, percent: 458.2 });
    expect(report.comparison.expenses).toEqual({ amount: 1_000_000, percent: null });

    expect(report.trend).toHaveLength(12);
    expect(report.trend[0].month).toBe("2034-04");
    expect(report.trend[11]).toEqual({ month: "2035-03", revenue: 2_350_000, cost: 1_120_000, netProfit: 1_230_000 });
    expect(report.trend[10]).toEqual({ month: "2035-02", revenue: 421_000, cost: 0, netProfit: 421_000 });
    expect(report.trend[9]).toEqual({ month: "2035-01", revenue: 0, cost: 0, netProfit: 0 });
  });

  it("SQL sama dengan aturan di kode: diskon persen dibulatkan ke bawah, nominal dibatasi subtotal, belum tertagih", async () => {
    const june = await getProfitReport({ period: { from: "2035-06-01", to: "2035-06-30" }, branchId: world.branchId }, NOW);
    expect(june.current.totals).toMatchObject({ service: 333_335, goods: 100_000, discount: 110_000 + 100_000, cogs: 24_690 });
    expect(june.current.totals.outstanding).toBe(333_335 - 110_000 - 100_000);
    expect(june.current.invoiceCount).toBe(2);
  });

  it("pembanding independen: jumlah dari fungsi aturan atas semua tagihan final cabang uji sama dengan laporan, per bulan", async () => {
    const invoices = await prisma.invoice.findMany({
      where: { branchId: world.branchId, status: "FINAL" },
      select: {
        finalizedAt: true,
        status: true,
        discountKind: true,
        discountValue: true,
        lines: { select: { kind: true, quantity: true, unitPrice: true, stockUses: { select: { quantity: true, unitCost: true } } } },
        payments: { select: { amount: true, revokedAt: true } },
      },
    });
    for (const month of ["2035-02", "2035-03", "2035-04", "2035-06"]) {
      const expected = { service: 0, treatment: 0, goods: 0, discount: 0, cogs: 0, outstanding: 0 };
      for (const invoice of invoices) {
        const key = new Date(invoice.finalizedAt!.getTime() + 8 * 3600_000).toISOString().slice(0, 7);
        if (key !== month) continue;
        let subtotal = 0;
        for (const line of invoice.lines) {
          const amount = line.quantity * line.unitPrice;
          subtotal += amount;
          if (line.kind === "LAYANAN") expected.service += amount;
          else if (line.kind === "TREATMENT") expected.treatment += amount;
          else expected.goods += amount;
          for (const use of line.stockUses) expected.cogs += use.quantity * use.unitCost;
        }
        expected.discount += discountAmount(subtotal, invoice.discountKind, invoice.discountValue);
        expected.outstanding += Math.max(0, invoiceTotals(invoice).balance);
      }
      const report = await getProfitReport({ period: monthPeriod(month), branchId: world.branchId }, NOW);
      expect(report.current.totals, month).toMatchObject(expected);
    }
  });

  it("tren sama dengan laporan periode per bulan (pendapatan, biaya, laba) untuk ke-12 bulan", async () => {
    const trendReport = await getProfitReport({ period: MARCH, branchId: world.branchId }, NOW);
    for (const point of trendReport.trend) {
      const month = await getProfitReport({ period: monthPeriod(point.month), branchId: world.branchId }, NOW);
      expect(point, point.month).toEqual({
        month: point.month,
        revenue: month.current.totals.revenue,
        cost: month.current.totals.cogs + month.current.totals.expenses,
        netProfit: month.current.totals.netProfit,
      });
    }
    expect(trendReport.trend.map((p) => p.month)).toEqual(trendMonths("2035-03-15"));
  });

  it("tren semua cabang sama dengan laporan per bulan, termasuk pengeluaran umum dan cabang lain", async () => {
    const trendReport = await getProfitReport({ period: MARCH, branchId: null }, NOW);
    const march = trendReport.trend[11];
    const month = await getProfitReport({ period: monthPeriod("2035-03"), branchId: null }, NOW);
    expect(march.revenue).toBe(month.current.totals.revenue);
    expect(march.cost).toBe(month.current.totals.cogs + month.current.totals.expenses);
  });

  it("periode kosong menghasilkan nol, bukan galat; kategori nonaktif tetap tampil", async () => {
    const empty = await getProfitReport({ period: { from: "2036-01-01", to: "2036-01-31" }, branchId: world.branchId }, NOW);
    expect(empty.current.totals.revenue).toBe(0);
    expect(empty.current.totals.netProfit).toBe(0);
    expect(empty.comparison.revenue).toEqual({ amount: 0, percent: null });

    await expense("2035-05-05", retired, 12_000);
    const may = await getProfitReport({ period: { from: "2035-05-01", to: "2035-05-31" }, branchId: world.branchId }, NOW);
    expect(may.current.expensesByCategory).toEqual([{ categoryId: retired, name: `${SLUG} Lama`, isActive: false, amount: 12_000 }]);
  });

  it("rentang tidak sah dan cabang yang tidak ada ditolak", async () => {
    await expect(getProfitReport({ period: { from: "2035-01-01", to: "2036-06-01" }, branchId: null }, NOW)).rejects.toThrow(
      "Rentang laporan paling lama 366 hari.",
    );
    await expect(getProfitReport({ period: { from: "2035-03-10", to: "2035-03-01" }, branchId: null }, NOW)).rejects.toThrow(
      "Tanggal dari tidak boleh setelah tanggal sampai.",
    );
    await expect(getProfitReport({ period: MARCH, branchId: "tidak-ada" }, NOW)).rejects.toThrow("Cabang tidak ditemukan.");
  });

  it("laba bulan ini (semua cabang) untuk dasbor", async () => {
    const month = await getMonthProfit(NOW);
    expect(month).toEqual({ month: "2035-03", revenue: 7_350_000, netProfit: 7_350_000 - 120_000 - 1_100_000 });
  });

  it("hak akses: hanya Admin Keuangan dan Super Admin", async () => {
    for (const role of ["DOKTER", "APOTEKER", "RESEPSIONIS", "TERAPIS"] as const) {
      actor.role = role;
      await expect(getProfitReport({ period: MARCH, branchId: null }, NOW)).rejects.toThrow(/forbidden: profit:read/);
      await expect(getMonthProfit(NOW)).rejects.toThrow(/forbidden: profit:read/);
    }
    actor.role = "SUPER_ADMIN";
    expect((await getProfitReport({ period: MARCH, branchId: null }, NOW)).current.totals.revenue).toBeGreaterThan(0);
  });
});
