// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import type { LegacyPackageForm } from "@/lib/legacy-package";
import type { LegacyPatientInput } from "@/lib/patient-registration";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { loadInvoiceA4 } from "@/server/invoice-a4-store";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { createLegacyPackage } from "@/server/legacy-packages";
import { visitsDoneByPackage } from "@/server/package-store";
import { getPatientPackage, listPackageOptions, searchPatientPackages } from "@/server/patient-package-read";
import { changeNextVisit } from "@/server/patient-packages";
import { getReminderWorklist } from "@/server/reminder";
import { packageSessionsUsed } from "@/server/report-sql";
import { testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

// Paket lama di tagihan, rencana kunjungan, Pengingat, dan invoice A4 (spec paket lama bagian 5, 6, 9; rencana Task 4).
vi.mock("@/server/session", () => {
  const actor = { userId: "u", staffId: "s", name: "Staf Paket", role: "SUPER_ADMIN", email: "u@uji.test" };
  return { requireCapability: vi.fn().mockResolvedValue(actor), requireAnyCapability: vi.fn().mockResolvedValue(actor) };
});

const SLUG = "paket-lama-pakai";
const WA = "6281200009704";
const REMIND_WA = "6281200009705";
let world: BillingWorld;
let luxId: string;
let facialItemId: string;
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

const form = (patch: Partial<LegacyPackageForm> & { usedFacial: number }): LegacyPackageForm => ({
  packageId: luxId,
  boughtOn: "2025-03-01",
  priorVisits: patch.usedFacial,
  used: { [facialItemId]: patch.usedFacial },
  nextVisitOn: null,
  note: "",
  confirmDuplicate: true,
  ...patch,
});
const newPatient = (whatsapp: string): LegacyPatientInput => ({
  nik: "",
  name: "Pasien Ingat Kluto",
  whatsapp,
  birthDate: "",
  gender: null,
  address: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
});

/** Satu kunjungan yang memakai satu sesi paket customer, sampai tagihan final. */
async function useOneSession(patientPackageId: string): Promise<{ id: string; number: string }> {
  const item = await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackageId } });
  const { appointmentId } = await finalVisit(world);
  const visit = await unwrap(createInvoiceFromVisit(appointmentId));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
  await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: item.id }));
  const final = await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }));
  return { id: visit.id, number: final.number };
}
const usedFacial = async () =>
  (await packageSessionsUsed(day(today), day(addDaysToDateString(today, 1)), null)).find((row) => row.name === "Facial Uji")?.sessions ?? 0;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, REMIND_WA]);
  world = await createBillingWorld(SLUG, WA);
  luxId = await catalogPackage(world, { name: "Lux", validDays: 90, visitIntervalDays: 7, items: [{ serviceId: world.treatmentId, sessions: 4 }] });
  facialItemId = (await prisma.treatmentPackageItem.findFirstOrThrow({ where: { packageId: luxId } })).id;
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, REMIND_WA]);
  await prisma.$disconnect();
});

describe("paket lama dipakai di SunDY", () => {
  it("saringan Paket lama dan urutan pilihan: paket berbatas waktu lebih dulu", async () => {
    const legacy = await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form({ usedFacial: 2 }) }));
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId: luxId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));

    const onlyLegacy = await searchPatientPackages(SLUG, { source: "KLUTO" });
    expect(onlyLegacy.map((row) => row.id)).toEqual([legacy.patientPackageId]);
    expect(onlyLegacy[0]).toMatchObject({ source: "KLUTO", note: null, purchaseInvoice: null });
    expect((await searchPatientPackages(SLUG)).map((row) => row.source).sort()).toEqual(["KLUTO", "TAGIHAN"]);

    const options = (await listPackageOptions(world.patientId)).filter((option) => option.serviceId === world.treatmentId);
    expect(options.map((option) => option.legacy ?? false)).toEqual([false, true]);
    await prisma.patientPackage.update({ where: { id: legacy.patientPackageId }, data: { status: "DIBATALKAN" } });
  });

  it("sesi terakhir paket lama dipakai: habis, masuk laporan sesi terpakai, satu kunjungan SunDY; invoice A4 tanpa batas waktu", async () => {
    const legacy = await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form({ usedFacial: 3 }) }));
    const before = await usedFacial();
    const invoice = await useOneSession(legacy.patientPackageId);
    const detail = (await getPatientPackage(legacy.patientPackageId))!;
    expect(detail.state).toBe("HABIS");
    expect(await usedFacial()).toBe(before + 1);
    expect((await visitsDoneByPackage(prisma, [legacy.patientPackageId])).get(legacy.patientPackageId)).toBe(1);

    const a4 = (await loadInvoiceA4(invoice.id))!;
    const pkg = a4.packages.find((row) => row.name === `${SLUG} Lux`)!;
    expect(pkg.expiresOn).toBe("9999-12-31");
    expect(pkg.items[0]).toMatchObject({ total: 4, used: 4, remaining: 0 });
  });

  it("rencana kosong terisi saat dipakai pertama kali, nomor kunjungan meneruskan Kluto, kembali kosong bila tagihannya dibatalkan (Review Focus 4)", async () => {
    const legacy = await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form: form({ usedFacial: 1 }) }));
    const invoice = await useOneSession(legacy.patientPackageId);
    const owned = await prisma.patientPackage.findUniqueOrThrow({ where: { id: legacy.patientPackageId } });
    expect(witaDateString(owned.nextVisitOn!)).toBe(addDaysToDateString(today, 7));

    const detail = (await getPatientPackage(legacy.patientPackageId))!;
    expect(detail.priorVisits).toBe(1);
    expect(detail.doneVisits.map((visit) => visit.number)).toEqual([2]);
    expect(detail.plan[0].number).toBe(3);
    expect(detail.items[0]).toMatchObject({ remaining: 2, usedHere: 1 });

    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: invoice.id, reason: "Salah input" }));
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: legacy.patientPackageId } })).nextVisitOn).toBeNull();
    expect((await getPatientPackage(legacy.patientPackageId))!.items[0].usedHere).toBe(0);

    // Ubah tanggal rencana bisa mengisi rencana yang kosong, tanpa batas atas (spec bagian 6).
    await unwrap(changeNextVisit({ packageId: legacy.patientPackageId, visitOn: addDaysToDateString(today, 1) }));
    await unwrap(changeNextVisit({ packageId: legacy.patientPackageId, visitOn: "2030-01-01" }));
    expect(witaDateString((await prisma.patientPackage.findUniqueOrThrow({ where: { id: legacy.patientPackageId } })).nextVisitOn!)).toBe("2030-01-01");
  });

  it("Pengingat: paket lama bertanggal masuk dengan nomor kunjungan lanjutan; yang rencananya kosong tidak", async () => {
    const dated = await unwrap(
      createLegacyPackage({ patient: { new: newPatient("081200009705") }, form: form({ usedFacial: 2, priorVisits: 5, nextVisitOn: today }) }),
    );
    const blank = await unwrap(createLegacyPackage({ patient: { id: dated.patientId }, form: form({ usedFacial: 2 }) }));
    const rows = (await getReminderWorklist()).packageVisits;
    const row = rows.find((r) => r.patientPackageId === dated.patientPackageId);
    expect(row).toMatchObject({ visitNumber: 6, visitOn: today });
    expect(row!.message.text).toContain("kunjungan ke-6");
    expect(rows.some((r) => r.patientPackageId === blank.patientPackageId)).toBe(false);
  });
});
