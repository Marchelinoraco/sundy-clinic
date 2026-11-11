// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import type { LegacyPackageForm } from "@/lib/legacy-package";
import type { LegacyPatientInput } from "@/lib/patient-registration";
import { listLegacyCatalog } from "@/server/legacy-package-read";
import { createLegacyPackage, findLegacyDuplicates } from "@/server/legacy-packages";
import { listPackageOptions, listPatientPackages } from "@/server/patient-package-read";
import { getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

// Memasukkan paket lama dari Kluto (spec paket lama PL1–PL10, bagian 4; rencana Task 3).
type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-lama";
const WA = "6281200009702";
const NEW_WA = "6281200009703";
const NIK = "7171015705900099";
let world: BillingWorld;
let luxId: string;
let luxItems: { id: string; serviceId: string | null; itemId: string | null }[];
const today = witaDateString(new Date());

const blankPatient = (patch: Partial<LegacyPatientInput> = {}): LegacyPatientInput => ({
  nik: "",
  name: "Ani Kluto",
  whatsapp: "081200009703",
  birthDate: "",
  gender: null,
  address: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  ...patch,
});

/** Lux: 4× Facial Uji + 28 botol Serum (7 per kunjungan). `used` bawaan: 3 sesi dan 21 botol. */
const form = (patch: Partial<LegacyPackageForm> = {}): LegacyPackageForm => ({
  packageId: luxId,
  boughtOn: "2025-03-01",
  priorVisits: 3,
  used: Object.fromEntries(luxItems.map((item) => [item.id, item.serviceId ? 3 : 21])),
  nextVisitOn: null,
  note: "Nota 123",
  confirmDuplicate: false,
  ...patch,
});

const countRows = async () => ({
  patients: await prisma.patient.count({ where: { whatsapp: { in: [WA, NEW_WA] } } }),
  packages: await prisma.patientPackage.count({ where: { patient: { whatsapp: { in: [WA, NEW_WA] } } } }),
});

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, NEW_WA]);
  world = await createBillingWorld(SLUG, WA);
  await prisma.patient.update({ where: { id: world.patientId }, data: { nik: NIK } });
  luxId = await catalogPackage(world, {
    name: "Lux",
    items: [
      { serviceId: world.treatmentId, sessions: 4 },
      { itemId: world.productId, sessions: 28, perVisit: 7 },
    ],
  });
  luxItems = await prisma.treatmentPackageItem.findMany({ where: { packageId: luxId }, orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, itemId: true } });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, NEW_WA]);
  await prisma.$disconnect();
});

describe("memasukkan paket lama (Kluto)", () => {
  it("pasien yang ada: paket KLUTO tanpa tagihan, harga 0, tanpa batas waktu, buku BELI + PAKAI_KLUTO, langsung bisa dipakai", async () => {
    const before = await getProfitReportAs();
    const result = await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form() }));
    expect(result.patientId).toBe(world.patientId);
    expect(result.summary).toContain("Lux");
    expect(result.summary).toContain("sisa 1× Facial Uji, 7 botol");

    const owned = await prisma.patientPackage.findUniqueOrThrow({
      where: { id: result.patientPackageId },
      include: { items: { orderBy: { sortOrder: "asc" }, include: { entries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } } },
    });
    expect(owned).toMatchObject({ source: "KLUTO", price: 0, purchaseLineId: null, priorVisits: 3, note: "Nota 123", nextVisitOn: null, status: "AKTIF" });
    expect(witaDateString(owned.startsOn)).toBe("2025-03-01");
    expect(owned.expiresOn.toISOString().slice(0, 10)).toBe("9999-12-31");
    expect(owned.items.map((item) => [item.sessions, item.entries.map((e) => [e.kind, e.delta, e.staffName, e.invoiceLineId])])).toEqual([
      [4, [["BELI", 4, "Staf Paket", null], ["PAKAI_KLUTO", -3, "Staf Paket", null]]],
      [28, [["BELI", 28, "Staf Paket", null], ["PAKAI_KLUTO", -21, "Staf Paket", null]]],
    ]);

    const [row] = (await listPatientPackages(world.patientId)).filter((r) => r.id === result.patientPackageId);
    expect(row).toMatchObject({ state: "AKTIF", purchaseInvoice: null, items: [{ remaining: 1 }, { remaining: 7 }] });
    const options = await listPackageOptions(world.patientId);
    expect(options.filter((o) => o.patientPackageId === result.patientPackageId).map((o) => [o.remaining, o.legacy])).toEqual([
      [1, true],
      [7, true],
    ]);
    const audit = await prisma.auditLog.findFirst({ where: { action: "patient-package.legacy-create", entityId: result.patientPackageId } });
    expect(audit?.summary).toContain("Lux");

    // Uang tidak bergerak: tanpa tagihan, pendapatan paket tetap (PL7).
    const after = await getProfitReportAs();
    expect(after.current.totals.package).toBe(before.current.totals.package);
  });

  it("pasien baru cukup nama dan WA; dibuat bersama paketnya dengan nomor RM baru", async () => {
    const result = await unwrap(createLegacyPackage({ patient: { new: blankPatient() }, form: form() }));
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: result.patientId } });
    expect(patient).toMatchObject({ name: "Ani Kluto", whatsapp: NEW_WA, nik: null, nikMissingReason: null, birthDate: null, address: null });
    expect(patient.medicalRecordNumber).toMatch(/\d/);
    expect(await prisma.auditLog.findFirst({ where: { action: "patient.create", entityId: patient.id } })).not.toBeNull();
  });

  it("NIK pasien baru yang sudah terdaftar ditolak tanpa meninggalkan pasien atau paket", async () => {
    const before = await countRows();
    const result = await createLegacyPackage({ patient: { new: blankPatient({ nik: NIK }) }, form: form() });
    expect(result).toEqual({ ok: false, error: `NIK ini sudah terdaftar atas nama Pasien ${SLUG} (${(await prisma.patient.findUniqueOrThrow({ where: { id: world.patientId } })).medicalRecordNumber}).` });
    expect(await countRows()).toEqual(before);
  });

  it("pasien baru dengan isian tidak sah: galat pertama menurut urutan isian", async () => {
    const result = await createLegacyPackage({ patient: { new: blankPatient({ name: "", whatsapp: "" }) }, form: form() });
    expect(result).toEqual({ ok: false, error: "Nama pasien wajib diisi." });
  });

  it("Admin Keuangan tidak memasukkan paket lama (PL2)", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(createLegacyPackage({ patient: { id: world.patientId }, form: form() })).rejects.toThrow("forbidden: invoice:manage");
  });

  it("paket yang semua isinya sudah terpakai ditolak", async () => {
    const before = await countRows();
    const used = Object.fromEntries(luxItems.map((item) => [item.id, item.serviceId ? 4 : 28]));
    expect(await createLegacyPackage({ patient: { id: world.patientId }, form: form({ used }) })).toEqual({
      ok: false,
      error: "Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan.",
    });
    expect(await countRows()).toEqual(before);
  });

  it("paket lama ganda butuh centang 'Ini paket yang berbeda' (PL10)", async () => {
    const duplicates = await unwrap(findLegacyDuplicates({ patientId: world.patientId, packageId: luxId }));
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
    expect(duplicates[0]).toMatchObject({ staffName: "Staf Paket", enteredOn: today });
    expect(duplicates[0].remainingLabel).toContain("Facial Uji");
    expect(await createLegacyPackage({ patient: { id: world.patientId }, form: form() })).toEqual({
      ok: false,
      error: `Pasien ini sudah punya paket lama ${SLUG} Lux. Centang “Ini paket yang berbeda” bila memang dibeli dua kali.`,
    });
    await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form({ confirmDuplicate: true }) }));
  });

  it("isi katalog yang berubah selama dialog terbuka ditolak (Review Focus 3)", async () => {
    const otherId = await catalogPackage(world, { name: "Ganti", items: [{ serviceId: world.treatmentId, sessions: 3 }] });
    const stale = await prisma.treatmentPackageItem.findFirstOrThrow({ where: { packageId: otherId } });
    await prisma.treatmentPackageItem.delete({ where: { id: stale.id } });
    await prisma.treatmentPackageItem.create({ data: { packageId: otherId, serviceId: world.treatmentId, sessions: 3 } });
    expect(await createLegacyPackage({ patient: { id: world.patientId }, form: form({ packageId: otherId, used: { [stale.id]: 1 } }) })).toEqual({
      ok: false,
      error: "Isi paket ini berubah. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("paket katalog nonaktif tetap bisa dipilih dan tampil sesudah yang aktif", async () => {
    const oldId = await catalogPackage(world, { name: "Lawas", isActive: false, items: [{ serviceId: world.treatmentId, sessions: 2 }] });
    const catalog = await listLegacyCatalog();
    const mine = catalog.filter((pkg) => pkg.name.startsWith(SLUG));
    expect(mine.at(-1)).toMatchObject({ id: oldId, isActive: false, items: [{ name: "Facial Uji", sessions: 2, unit: null, perVisit: null }] });
    expect(mine.find((pkg) => pkg.id === luxId)?.items[1]).toMatchObject({ unit: "botol", sessions: 28, perVisit: 7 });
    const itemId = mine.at(-1)!.items[0].id;
    await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form({ packageId: oldId, used: { [itemId]: 1 } }) }));
  });

  it("pasien rangkap yang sudah digabung tidak bisa dipilih", async () => {
    const merged = await prisma.patient.create({ data: { medicalRecordNumber: `${SLUG}-RANGKAP`, name: "Rangkap", whatsapp: WA, mergedIntoId: world.patientId } });
    expect(await createLegacyPackage({ patient: { id: merged.id }, form: form() })).toEqual({ ok: false, error: "Pilih pasien." });
  });
});

async function getProfitReportAs() {
  const role = actor.role;
  actor.role = "SUPER_ADMIN";
  try {
    return await getProfitReport({ period: monthPeriod(today.slice(0, 7)), branchId: null });
  } finally {
    actor.role = role;
  }
}
