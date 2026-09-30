// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emptyDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { finalizeEncounter, openEncounter } from "@/server/encounter";
import { getPatientDetail, updatePaperRecordNumber, updatePatientImportantNotes } from "@/server/patient";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));

const SLUG = "rekam-pasien-uji";
const PATIENT_WA = "6281200007730";
const LONG_ASSESSMENT = `Obesitas derajat 1 dengan resistensi insulin, riwayat diet yo-yo tiga kali, target turun 8 kg`;

describe("data pasien: catatan penting, no. RM kertas lama, riwayat kunjungan", () => {
  let world: BookingWorld;
  let patientId: string;
  let finalId: string;
  let draftId: string;

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    world = await createBookingWorld(SLUG);
    const date = await bookableDate();
    patientId = (
      await prisma.patient.create({
        data: {
          medicalRecordNumber: "SDY-2026-7730",
          name: "Pasien Rekam",
          whatsapp: PATIENT_WA,
          importantNotes: "Takut jarum",
          paperRecordNumber: "RM-0457",
        },
      })
    ).id;
    const booking = (code: string, time: string) => {
      const startAt = at(date, time);
      return prisma.appointment.create({
        data: {
          code,
          type: "KONSULTASI",
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60_000),
          status: "HADIR",
          source: "WALK_IN",
          branchId: world.branchId,
          staffId: world.doctorId,
          serviceId: world.consultationId,
          patientId,
        },
      });
    };
    actAs("DOKTER");
    const first = await booking("RKM-1", "11:00");
    finalId = (await unwrap(openEncounter(first.id))).encounterId;
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: finalId } });
    await unwrap(
      finalizeEncounter({ encounterId: finalId, version: updatedAt.toISOString(), draft: { ...emptyDraftInput(), assessment: LONG_ASSESSMENT } }),
    );
    const second = await booking("RKM-2", "12:00");
    draftId = (await unwrap(openEncounter(second.id))).encounterId;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA]);
    await prisma.$disconnect();
  });

  it("dokter melihat catatan penting, no. RM kertas lama, dan riwayat kunjungan terbaru di atas", async () => {
    actAs("DOKTER");
    const detail = (await getPatientDetail(patientId))!;

    expect(detail.paperRecordNumber).toBe("RM-0457");
    expect(detail.record).toMatchObject({ importantNotes: "Takut jarum" });
    expect(detail.encounters!.map((e) => e.id)).toEqual([draftId, finalId]);
    expect(detail.encounters![0]).toMatchObject({ status: "DRAF", code: "RKM-2", assessmentPreview: null, authorName: "DOKTER Uji" });
    expect(detail.encounters![1]).toMatchObject({ status: "FINAL", branchName: "Cabang Publik Uji" });
    expect(detail.encounters![1].assessmentPreview!.length).toBeLessThanOrEqual(80);
    expect(detail.encounters![1].assessmentPreview!.startsWith("Obesitas derajat 1")).toBe(true);
  });

  it("membuka riwayat pasien tercatat di audit paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const before = await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } });
    await getPatientDetail(patientId);
    await getPatientDetail(patientId);
    const after = await prisma.auditLog.count({ where: { action: "patient.view-records", entityId: patientId } });
    expect(after - before).toBeLessThanOrEqual(1);
    expect(after).toBeGreaterThanOrEqual(1);
  });

  it("resepsionis melihat no. RM kertas lama, tanpa catatan penting dan riwayat kunjungan", async () => {
    actAs("RESEPSIONIS");
    const detail = (await getPatientDetail(patientId))!;
    expect(detail.paperRecordNumber).toBe("RM-0457");
    expect(detail.record).toBeNull();
    expect(detail.encounters).toBeNull();
    expect(JSON.stringify(detail)).not.toMatch(/Takut jarum|Obesitas/);
    expect(await prisma.auditLog.count({ where: { action: "patient.view-records", actorRole: "RESEPSIONIS" } })).toBe(0);
  });

  it("catatan penting: dirapikan, kosong berarti dihapus, dibatasi 2.000 karakter, hanya record:write", async () => {
    actAs("DOKTER");
    await unwrap(updatePatientImportantNotes({ patientId, text: "  Kulit mudah iritasi  " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).importantNotes).toBe("Kulit mudah iritasi");
    await unwrap(updatePatientImportantNotes({ patientId, text: "   " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).importantNotes).toBeNull();
    expect(await updatePatientImportantNotes({ patientId, text: "x".repeat(2001) })).toEqual({
      ok: false,
      error: "Catatan penting terlalu panjang (maks. 2.000 karakter).",
    });
    expect(await prisma.auditLog.count({ where: { action: "patient.update-important-notes", entityId: patientId } })).toBe(2);

    actAs("RESEPSIONIS");
    await expect(updatePatientImportantNotes({ patientId, text: "x" })).rejects.toThrow(/forbidden/);
  });

  it("no. RM kertas lama boleh diubah resepsionis, dibatasi 50 karakter", async () => {
    actAs("RESEPSIONIS");
    await unwrap(updatePaperRecordNumber({ patientId, text: " RM-0999 " }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).paperRecordNumber).toBe("RM-0999");
    expect(await updatePaperRecordNumber({ patientId, text: "x".repeat(51) })).toEqual({
      ok: false,
      error: "No. RM kertas lama terlalu panjang (maks. 50 karakter).",
    });
    expect(await prisma.auditLog.count({ where: { action: "patient.update-paper-record-number", entityId: patientId } })).toBe(1);
  });
});
