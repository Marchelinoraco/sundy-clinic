// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED, recallDateLabel } from "@/lib/food-recall";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getFoodRecallLink, offerFoodRecall, saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { foodRecallCode } from "@/server/food-recall-code";
import { getFoodRecallPage, submitFoodRecall } from "@/server/food-recall-public";
import { quizLinkCode } from "@/server/quiz-link-code";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: {
    userId: "u1",
    staffId: "s1",
    name: "dr. Uji Food Recall",
    role: "DOKTER" as "DOKTER" | "RESEPSIONIS" | "SUPER_ADMIN",
    email: "uji@sundy.test",
  },
}));

// Meniru requireCapability: staf tanpa kemampuan itu ditolak.
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

const SLUG = "food-recall-uji";
const WA = "6281200009900";
const today = witaDateString(new Date());
const CUSTOMER_ROW = { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning 1 piring" };

describe("food recall: link, kiriman customer, suntingan dokter", () => {
  let world: BookingWorld;
  let patientId: string;
  let slot = 0;

  /** Booking pada tanggal hari ini + offset, mulai 04.00 bergeser 30 menit agar tidak bertindihan. */
  async function booking(status: AppointmentStatus = "HADIR", offsetDays = 0) {
    slot += 1;
    const minutes = 4 * 60 + slot * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const startAt = at(addDaysToDateString(today, offsetDays), time);
    return prisma.appointment.create({
      data: {
        code: `FRC-${slot}`,
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

  async function offered(offsetDays = 0) {
    const appointment = await booking("HADIR", offsetDays);
    const recall = await prisma.foodRecall.create({
      data: { appointmentId: appointment.id, recallDate: new Date(`${addDaysToDateString(today, offsetDays - 1)}T00:00:00Z`) },
    });
    return { appointment, recall, code: foodRecallCode(recall.id) };
  }

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    world = await createBookingWorld(SLUG);
    patientId = (
      await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-9900", name: "Siti Rahayu", whatsapp: WA } })
    ).id;
  });

  beforeEach(() => {
    actor.role = "DOKTER";
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("menawarkan food recall: satu baris H-1, link berlaku hari ini dengan pesan WA", async () => {
    const appointment = await booking();
    const info = await unwrap(offerFoodRecall(appointment.id));
    expect(info).toMatchObject({ state: "OPEN", filled: false });
    if (info.state !== "OPEN") throw new Error("link seharusnya berlaku");
    expect(info.url).toMatch(/\/food-recall#/);
    expect(info.message.link).toContain("wa.me/6281200009900");
    expect(info.message.text).not.toMatch(/pasien|berobat/i);

    await unwrap(offerFoodRecall(appointment.id));
    const rows = await prisma.foodRecall.findMany({ where: { appointmentId: appointment.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recallDate.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, -1));
  });

  it("tidak menawarkan food recall untuk booking yang belum check-in", async () => {
    const appointment = await booking("TERKONFIRMASI");
    expect(await offerFoodRecall(appointment.id)).toEqual({
      ok: false,
      error: "Food recall hanya untuk customer yang sudah check-in.",
    });
  });

  it("halaman link hanya memuat nama depan dan tanggal kemarin", async () => {
    const { code } = await offered();
    const page = await unwrap(getFoodRecallPage(code));
    expect(page).toEqual({ state: "OPEN", firstName: "Siti", recallDateLabel: recallDateLabel(addDaysToDateString(today, -1)) });
    expect(JSON.stringify(page)).not.toContain(WA);
    expect(JSON.stringify(page)).not.toContain("Rahayu");
  });

  it("kiriman customer tersimpan sebagai baris CUSTOMER, dan kiriman ulang menggantikannya", async () => {
    const { appointment, recall, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    await unwrap(submitFoodRecall({ code, entries: [{ hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M" }], website: "" }));

    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } });
    expect(row.status).toBe("DIISI");
    expect(row.entries).toEqual([{ hour: 12, kind: "KAPSUL_OBAT", text: "Kapsul M", by: "CUSTOMER" }]);
    expect(row.submittedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "food-recall.submit", entityId: appointment.id } })).toBe(2);
  });

  it("link kemarin tidak berlaku: halaman tertutup dan kiriman ditolak tanpa menyimpan", async () => {
    const { recall, code } = await offered(-1);
    expect(await unwrap(getFoodRecallPage(code))).toEqual({ state: "CLOSED" });
    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_CLOSED,
    });
    expect((await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } })).entries).toEqual([]);
  });

  it("kode link kuis dan kode rusak tidak membuka food recall", async () => {
    const { recall, appointment } = await offered();
    expect(await unwrap(getFoodRecallPage(quizLinkCode(recall.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getFoodRecallPage(quizLinkCode(appointment.id, 0)))).toEqual({ state: "CLOSED" });
    expect(await unwrap(getFoodRecallPage("bukan-kode"))).toEqual({ state: "CLOSED" });
  });

  it("kolom jebakan bot menolak kiriman", async () => {
    const { code } = await offered();
    expect((await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "spam" })).ok).toBe(false);
  });

  it("dokter melengkapi: baris baru DOKTER, link customer ditutup", async () => {
    const { appointment, recall, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    await unwrap(
      saveFoodRecallByStaff({
        appointmentId: appointment.id,
        entries: [{ ...CUSTOMER_ROW, by: "CUSTOMER" }, { hour: 9, kind: "OLAHRAGA", text: "Senam pagi" }],
      }),
    );

    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { id: recall.id } });
    expect(row.entries).toEqual([
      { ...CUSTOMER_ROW, by: "CUSTOMER" },
      { hour: 9, kind: "OLAHRAGA", text: "Senam pagi", by: "DOKTER" },
    ]);
    expect(row.completedByName).toBe("dr. Uji Food Recall");
    expect(await unwrap(getFoodRecallPage(code))).toEqual({ state: "RECEIVED" });
    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_RECEIVED,
    });
  });

  it("dokter bisa melengkapi walau food recall belum ditawarkan", async () => {
    const appointment = await booking();
    await unwrap(saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] }));
    const row = await prisma.foodRecall.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(row).toMatchObject({ status: "DIISI", entries: [{ ...CUSTOMER_ROW, by: "DOKTER" }] });
  });

  it("setelah catatan final: kiriman customer dan suntingan dokter ditolak", async () => {
    const { appointment, code } = await offered();
    const encounter = await prisma.encounter.create({
      data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji", assessment: "Obesitas" },
    });
    await prisma.$transaction([
      prisma.encounter.update({
        where: { id: encounter.id },
        data: { status: "FINAL", finalizedAt: new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
      }),
      prisma.appointment.update({ where: { id: appointment.id }, data: { status: "SELESAI" } }),
    ]);

    expect(await submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" })).toEqual({
      ok: false,
      error: FOOD_RECALL_RECEIVED,
    });
    expect(await saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] })).toEqual({
      ok: false,
      error: "Catatan dokter sudah final; food recall tidak bisa diubah.",
    });
  });

  it("resepsionis melihat status link tanpa isi catatan, dan tidak bisa melengkapi", async () => {
    const { appointment, code } = await offered();
    await unwrap(submitFoodRecall({ code, entries: [CUSTOMER_ROW], website: "" }));
    actor.role = "RESEPSIONIS";

    const info = await unwrap(getFoodRecallLink(appointment.id));
    expect(info).toMatchObject({ state: "OPEN", filled: true });
    expect(JSON.stringify(info)).not.toContain("Nasi kuning");
    await expect(saveFoodRecallByStaff({ appointmentId: appointment.id, entries: [CUSTOMER_ROW] })).rejects.toThrow(
      /forbidden: record:write/,
    );
  });

  it("booking tanpa food recall dilaporkan belum ditawarkan", async () => {
    const appointment = await booking();
    expect(await unwrap(getFoodRecallLink(appointment.id))).toEqual({ state: "NOT_OFFERED" });
  });
});
