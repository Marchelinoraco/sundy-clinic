"use server";

import { randomBytes } from "node:crypto";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { HOLD_MINUTES, PUBLIC_MIN_LEAD_MINUTES, isBookableDate } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { createRateLimiter } from "@/lib/rate-limit";
import type { SlotOption } from "@/lib/slot";
import { witaDateString } from "@/lib/time";
import { computeAvailability } from "@/server/availability";
import { isExclusionViolation } from "@/server/db-errors";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Karena itu setiap aksi memeriksa pembatasan laju dan inputnya sendiri.

export type PublicSlot = SlotOption & { staffId: string; staffName: string };
export type SlotHoldReceipt = { token: string; expiresAt: Date };

const slotLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const holdLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

const DATE_OUT_OF_RANGE = "Pilih tanggal antara hari ini dan 30 hari ke depan.";
const SLOT_GONE = "Jam ini baru saja dipilih orang lain. Pilih jam lain.";

async function loadServiceAndBranch(serviceId: string, branchId: string) {
  const [service, branch] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, durationMin: true, requiresDoctor: true, isActive: true },
    }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { status: true } }),
  ]);
  if (!service?.isActive) throw new UserFacingError("Layanan ini tidak tersedia untuk booking.");
  if (branch?.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima booking.");
  return service;
}

/** Tenaga yang boleh menangani layanan: dokter saja bila requiresDoctor (PRD F4a). */
async function eligibleStaff(service: { requiresDoctor: boolean }, staffId: string | null) {
  const staff = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: service.requiresDoctor ? "DOKTER" : { in: ["DOKTER", "TERAPIS"] },
      ...(staffId ? { id: staffId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  if (staff.length === 0) throw new UserFacingError("Tenaga ini tidak menangani layanan tersebut.");
  return staff;
}

export async function getPublicSlots(input: {
  serviceId: string;
  /** null = "siapa saja yang tersedia". */
  staffId: string | null;
  branchId: string;
  date: string;
  holdToken: string | null;
}): Promise<ActionResult<PublicSlot[]>> {
  return runAction(async () => {
    await guardRate(slotLimiter);
    if (!isBookableDate(input.date, new Date())) throw new UserFacingError(DATE_OUT_OF_RANGE);

    const service = await loadServiceAndBranch(input.serviceId, input.branchId);
    const staff = await eligibleStaff(service, input.staffId);

    const perStaff = await Promise.all(
      staff.map(async (person) => {
        const slots = await computeAvailability(
          { staffId: person.id, branchId: input.branchId, date: input.date, durationMinutes: service.durationMin },
          { minLeadMinutes: PUBLIC_MIN_LEAD_MINUTES, holds: { excludeToken: input.holdToken } },
        );
        return slots.map((slot) => ({ ...slot, staffId: person.id, staffName: person.name }));
      }),
    );

    // "Siapa saja": satu tombol per jam, diisi tenaga pertama (sortOrder) yang kosong.
    const byStart = new Map<number, PublicSlot>();
    for (const slots of perStaff) {
      for (const slot of slots) {
        if (!byStart.has(slot.startAt.getTime())) byStart.set(slot.startAt.getTime(), slot);
      }
    }
    return [...byStart.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  });
}

export async function holdSlot(input: {
  serviceId: string;
  staffId: string;
  branchId: string;
  /** ISO string dari PublicSlot.startAt. */
  startAt: string;
  /** Hold pasien ini sebelumnya — dilepas saat ia memilih jam lain. */
  previousToken: string | null;
}): Promise<ActionResult<SlotHoldReceipt>> {
  return runAction(async () => {
    await guardRate(holdLimiter);

    // Beda dari getPublicSlots: di sini staffId wajib. "Siapa saja" sudah
    // diselesaikan client jadi satu staffId nyata sebelum menahan jam —
    // permintaan mentah tanpa staffId tidak boleh diam-diam jatuh ke staf
    // pertama yang kosong lewat eligibleStaff.
    if (typeof input.staffId !== "string" || !input.staffId) {
      throw new UserFacingError("Tenaga ini tidak menangani layanan tersebut.");
    }

    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) throw new UserFacingError(SLOT_GONE);
    const now = new Date();
    const date = witaDateString(startAt);
    if (!isBookableDate(date, now)) throw new UserFacingError(DATE_OUT_OF_RANGE);

    const service = await loadServiceAndBranch(input.serviceId, input.branchId);
    const [staff] = await eligibleStaff(service, input.staffId);

    // Hanya jam yang memang ditawarkan boleh ditahan: permintaan buatan tidak
    // bisa menahan jam di luar jadwal, di antara grid, atau kurang dari 2 jam lagi.
    const offered = await computeAvailability(
      { staffId: staff.id, branchId: input.branchId, date, durationMinutes: service.durationMin },
      { minLeadMinutes: PUBLIC_MIN_LEAD_MINUTES, holds: { excludeToken: input.previousToken } },
    );
    const slot = offered.find((candidate) => candidate.startAt.getTime() === startAt.getTime());
    if (!slot) throw new UserFacingError(SLOT_GONE);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

    try {
      await prisma.$transaction([
        // Hold basi tetap ikut exclusion constraint sampai barisnya dihapus
        // (catatan risiko Plan 3a) — bersihkan milik tenaga ini lebih dulu.
        prisma.slotHold.deleteMany({ where: { staffId: staff.id, expiresAt: { lte: now } } }),
        ...(input.previousToken ? [prisma.slotHold.deleteMany({ where: { token: input.previousToken } })] : []),
        prisma.slotHold.create({
          data: {
            token,
            startAt: slot.startAt,
            endAt: slot.endAt,
            expiresAt,
            staffId: staff.id,
            branchId: input.branchId,
          },
        }),
      ]);
    } catch (error) {
      if (isExclusionViolation(error)) throw new UserFacingError(SLOT_GONE);
      throw error;
    }

    return { token, expiresAt };
  });
}
