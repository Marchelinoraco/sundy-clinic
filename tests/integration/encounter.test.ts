// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { can } from "@/lib/permissions";
import { cancelAppointment, markNoShow, rescheduleAppointment } from "@/server/appointment";
import {
  addEncounterAddendum,
  discardEncounterDraft,
  finalizeEncounter,
  openEncounter,
  saveEncounterDraft,
} from "@/server/encounter";
import { matchPatient } from "@/server/intake";
import { requireCapability } from "@/server/session";
import { unwrap } from "./unwrap";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";

vi.mock("@/server/session", () => ({ requireCapability: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const SLUG = "aksi-kunjungan-uji";
const PATIENT_WA = "6281200007710";
const OTHER_WA = "6281200007711";

function draftWith(
  patch: Omit<Partial<EncounterDraftInput>, "vitals"> & { vitals?: Partial<EncounterDraftInput["vitals"]> } = {},
): EncounterDraftInput {
  const base = emptyDraftInput();
  return { ...base, ...patch, vitals: { ...base.vitals, ...patch.vitals } };
}

describe("aksi kunjungan", () => {
  let world: BookingWorld;
  let date: string;
  let patientId: string;
  let slot = 0;

  function actAs(role: StaffRole) {
    vi.mocked(requireCapability).mockImplementation(async (capability) => {
      if (!can(role, capability)) throw new Error(`forbidden: ${capability}`);
      return { userId: "u1", staffId: world.doctorId, name: `${role} Uji`, role, email: "uji@sundy.test" };
    });
  }

  /** Booking pada jam berikutnya (06.00, 06.30, …) di `day`, bawaannya HADIR. */
  async function booking(status: "HADIR" | "TERKONFIRMASI" = "HADIR", day = date) {
    slot += 1;
    const minutes = 6 * 60 + slot * 30;
    const startAt = at(day, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return prisma.appointment.create({
      data: {
        code: `AKJ-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  async function opened() {
    const appointment = await booking();
    const { encounterId } = await unwrap(openEncounter(appointment.id));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    return { appointment, encounterId, version: updatedAt.toISOString() };
  }

  const auditCount = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    world = await createBookingWorld(SLUG);
    date = await bookableDate();
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7710", name: "Pasien Aksi", whatsapp: PATIENT_WA } })
    ).id;
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [PATIENT_WA, OTHER_WA]);
    await prisma.$disconnect();
  });

  it("Periksa membuat satu kunjungan per booking dan mencatat audit sekali", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    const first = await unwrap(openEncounter(appointment.id));
    const second = await unwrap(openEncounter(appointment.id));

    expect(second.encounterId).toBe(first.encounterId);
    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: first.encounterId } });
    expect(row).toMatchObject({ status: "DRAF", createdById: world.doctorId, createdByName: "DOKTER Uji" });
    expect(await auditCount("encounter.create", first.encounterId)).toBe(1);
  });

  it("tinggi badan diisikan dari kunjungan final terakhir pasien, bukan dari draf", async () => {
    actAs("DOKTER");
    const first = await opened();
    await unwrap(
      finalizeEncounter({
        encounterId: first.encounterId,
        version: first.version,
        draft: draftWith({ assessment: "Kontrol", vitals: { heightCm: "160" } }),
      }),
    );
    // Draf yang lebih baru dengan tinggi lain tidak boleh menjadi sumber isian awal.
    const later = await opened();
    await unwrap(saveEncounterDraft({ encounterId: later.encounterId, version: later.version, draft: draftWith({ vitals: { heightCm: "170" } }) }));

    const next = await opened();
    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: next.encounterId } });
    expect(Number(row.heightCm)).toBe(160);
  });

  it("dua klik Periksa bersamaan tetap satu kunjungan", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    const [a, b] = await Promise.all([openEncounter(appointment.id), openEncounter(appointment.id)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await prisma.encounter.count({ where: { appointmentId: appointment.id } })).toBe(1);
  });

  it("kunjungan hanya dibuka dari booking yang sudah ditandai hadir", async () => {
    actAs("DOKTER");
    const appointment = await booking("TERKONFIRMASI");
    expect(await openEncounter(appointment.id)).toEqual({
      ok: false,
      error: "Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir.",
    });
  });

  it("resepsionis ditolak di setiap aksi kunjungan", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    actAs("RESEPSIONIS");
    await expect(openEncounter(appointment.id)).rejects.toThrow(/forbidden/);
    await expect(saveEncounterDraft({ encounterId, version, draft: draftWith() })).rejects.toThrow(/forbidden/);
    await expect(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "x" }) })).rejects.toThrow(/forbidden/);
    await expect(discardEncounterDraft({ encounterId, version })).rejects.toThrow(/forbidden/);
    await expect(addEncounterAddendum({ encounterId, text: "x" })).rejects.toThrow(/forbidden/);
  });

  it("menyimpan draf: teks, angka vital, dan treatment dengan nama yang disalin dari basis data", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    const saved = await unwrap(
      saveEncounterDraft({
        encounterId,
        version,
        draft: draftWith({
          subjective: "  Berat naik 3 kg  ",
          vitals: { systolic: "120", diastolic: "80", weightKg: "72,5", heightCm: "160" },
          treatments: [{ serviceId: world.treatmentId, area: "Wajah", dose: "", performerId: world.therapistId, notes: "" }],
        }),
      }),
    );
    expect(saved.version).not.toBe(version);

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: { treatments: true } });
    expect(row).toMatchObject({ subjective: "Berat naik 3 kg", systolic: 120, diastolic: 80, pulse: null });
    expect(Number(row.weightKg)).toBe(72.5);
    expect(row.treatments).toEqual([
      expect.objectContaining({ serviceName: "Facial Uji", performerName: "Terapis Uji Publik", area: "Wajah", dose: null, sortOrder: 0 }),
    ]);

    // Simpan berikutnya mengganti seluruh baris treatment.
    await unwrap(saveEncounterDraft({ encounterId, version: saved.version, draft: draftWith({ subjective: "Berat naik 3 kg" }) }));
    expect(await prisma.encounterTreatment.count({ where: { encounterId } })).toBe(0);
  });

  it("simpan draf menyegarkan halaman kunjungan, agar tombol Kembali tidak menampilkan isian lama", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    vi.mocked(revalidatePath).mockClear();
    await unwrap(saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "Kontrol" }) }));
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/kunjungan/${encounterId}`);
  });

  it("menolak versi lama tanpa mengubah catatan yang lebih baru", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    await unwrap(saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "Tab A" }) }));

    expect(await saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "Tab B" }) })).toEqual({
      ok: false,
      error: "Catatan ini baru diubah di tempat lain. Muat ulang halaman.",
    });
    expect((await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).plan).toBe("Tab A");
  });

  it("menolak angka vital yang tidak sah dengan pesan yang jelas", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await saveEncounterDraft({ encounterId, version, draft: draftWith({ vitals: { systolic: "12", diastolic: "8" } }) })).toEqual({
      ok: false,
      error: "Sistolik harus 50–260 mmHg.",
    });
    expect(await saveEncounterDraft({ encounterId, version, draft: { ...draftWith(), extra: true } as never })).toEqual({
      ok: false,
      error: "Isian tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });

  it("mencatat 'mengubah draf' paling banyak sekali per 30 menit", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    const first = await unwrap(saveEncounterDraft({ encounterId, version, draft: draftWith({ plan: "1" }) }));
    const second = await unwrap(saveEncounterDraft({ encounterId, version: first.version, draft: draftWith({ plan: "2" }) }));
    expect(await auditCount("encounter.edit-draft", encounterId)).toBe(1);

    await prisma.auditLog.updateMany({
      where: { action: "encounter.edit-draft", entityId: encounterId },
      data: { createdAt: new Date(Date.now() - 31 * 60_000) },
    });
    await unwrap(saveEncounterDraft({ encounterId, version: second.version, draft: draftWith({ plan: "3" }) }));
    expect(await auditCount("encounter.edit-draft", encounterId)).toBe(2);
  });

  it("finalisasi butuh penilaian (A)", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "   " }) })).toEqual({
      ok: false,
      error: "Isi penilaian (A) sebelum finalisasi.",
    });
  });

  it("finalisasi menyimpan isian yang dikirim, mengunci, menandai booking Selesai, dan mengisi kunjungan terakhir", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    await unwrap(
      finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Obesitas derajat 1", plan: "Program MAX" }) }),
    );

    const row = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(row).toMatchObject({ status: "FINAL", assessment: "Obesitas derajat 1", plan: "Program MAX", finalizedByName: "DOKTER Uji" });
    expect(row.finalizedAt).toBeInstanceOf(Date);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("SELESAI");
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).lastVisitAt).toEqual(appointment.startAt);
    expect(await auditCount("encounter.finalize", encounterId)).toBe(1);

    // Catatan final tidak bisa disimpan sebagai draf lagi.
    expect(await saveEncounterDraft({ encounterId, version: row.updatedAt.toISOString(), draft: draftWith() })).toEqual({
      ok: false,
      error: "Catatan ini sudah difinalisasi. Muat ulang halaman.",
    });
  });

  it("kunjungan lama yang difinalisasi belakangan tidak memundurkan kunjungan terakhir", async () => {
    actAs("DOKTER");
    const later = new Date(`${date}T15:00:00Z`);
    await prisma.patient.update({ where: { id: patientId }, data: { lastVisitAt: later } });
    const { encounterId, version } = await opened();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).lastVisitAt).toEqual(later);
  });

  it("membuang draf: kunjungan dan treatment terhapus, booking kembali belum diperiksa", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    const saved = await unwrap(
      saveEncounterDraft({
        encounterId,
        version,
        draft: draftWith({ treatments: [{ serviceId: world.treatmentId, area: "", dose: "", performerId: world.doctorId, notes: "" }] }),
      }),
    );
    await unwrap(discardEncounterDraft({ encounterId, version: saved.version }));

    expect(await prisma.encounter.findUnique({ where: { id: encounterId } })).toBeNull();
    expect(await prisma.encounterTreatment.count({ where: { encounterId } })).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("HADIR");
    expect(await auditCount("encounter.discard", encounterId)).toBe(1);

    // Tab lain yang masih terbuka tidak diam-diam membuat kunjungan baru.
    expect(await saveEncounterDraft({ encounterId, version: saved.version, draft: draftWith({ plan: "x" }) })).toEqual({
      ok: false,
      error: "Kunjungan ini sudah tidak ada (drafnya dibuang). Muat ulang halaman.",
    });
    expect(await prisma.encounter.count({ where: { appointmentId: appointment.id } })).toBe(0);
  });

  it("draf yang sudah final tidak bisa dibuang", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    const { updatedAt } = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(await discardEncounterDraft({ encounterId, version: updatedAt.toISOString() })).toEqual({
      ok: false,
      error: "Catatan ini sudah difinalisasi. Muat ulang halaman.",
    });
  });

  it("adendum hanya untuk catatan final, wajib berisi, dan tercatat di audit", async () => {
    actAs("DOKTER");
    const { encounterId, version } = await opened();
    expect(await addEncounterAddendum({ encounterId, text: "Koreksi" })).toEqual({
      ok: false,
      error: "Adendum hanya untuk catatan yang sudah final.",
    });

    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    expect(await addEncounterAddendum({ encounterId, text: "   " })).toEqual({ ok: false, error: "Tulis isi adendum dulu." });
    await unwrap(addEncounterAddendum({ encounterId, text: "  Tensi diukur ulang: 118/78.  " }));

    const addenda = await prisma.encounterAddendum.findMany({ where: { encounterId } });
    expect(addenda).toEqual([expect.objectContaining({ text: "Tensi diukur ulang: 118/78.", authorName: "DOKTER Uji" })]);
    expect(await auditCount("encounter.addendum", encounterId)).toBe(1);
  });

  it("booking yang sudah hadir atau selesai tidak bisa dibatalkan, ditandai tidak hadir, atau dipindah", async () => {
    actAs("DOKTER");
    const { appointment, encounterId, version } = await opened();
    const tryAll = async () => {
      expect((await cancelAppointment(appointment.id)).ok).toBe(false);
      expect((await markNoShow(appointment.id)).ok).toBe(false);
      const startAt = new Date(appointment.startAt.getTime() + 24 * 60 * 60_000);
      expect((await rescheduleAppointment(appointment.id, { startAt, endAt: new Date(startAt.getTime() + 30 * 60_000) })).ok).toBe(false);
    };
    await tryAll();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draftWith({ assessment: "Kontrol" }) }));
    await tryAll();
  });

  it("booking situs yang sudah hadir dan diperiksa tidak bisa dicocokkan ke pasien lain", async () => {
    actAs("DOKTER");
    const appointment = await booking();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { source: "SITUS" } });
    await prisma.intake.create({
      data: { appointmentId: appointment.id, patientId, status: "TERISI", kind: "LENGKAP", name: "Pasien Aksi", whatsapp: PATIENT_WA, submittedAt: new Date() },
    });
    await unwrap(openEncounter(appointment.id));
    const other = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-7711", name: "Pasien Lain", whatsapp: OTHER_WA } });

    expect((await matchPatient(appointment.id, other.id)).ok).toBe(false);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).patientId).toBe(patientId);
  });
});
