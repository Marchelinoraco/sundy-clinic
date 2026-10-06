"use server";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { STATUS_LABEL, type AppointmentStatusValue } from "@/lib/appointment-status";
import { generateBookingCode } from "@/lib/booking-code";
import {
  CONSULTATION_SERVICE_SLUG,
  HOLD_MINUTES,
  PUBLIC_MIN_LEAD_MINUTES,
  SLIMMING_CATEGORY_SLUG,
  canPatientChange,
  isBookableDate,
} from "@/lib/booking-rules";
import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { validateIdentity } from "@/lib/kuis/identity";
import { answersForStorage, type QuizAnswers } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { validateQuizAnswers } from "@/lib/kuis/v2/steps";
import { bookingFeeFor, formatBankAccount } from "@/lib/payment";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeRevalidatePath } from "@/lib/revalidate";
import type { SlotOption } from "@/lib/slot";
import { boundsOf, ONLINE_BRANCH_LABEL, onlineTotal, validateContactWindows, windowLines } from "@/lib/online-consultation";
import { minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
import {
  buildWhatsAppLink,
  maskWhatsapp,
  onlineChangeRequestMessage,
  onlineSiteBookingWhatsAppMessage,
  rescheduleRequestMessage,
  siteBookingWhatsAppMessage,
} from "@/lib/whatsapp";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { computeAvailability } from "@/server/availability";
import { expireStaleSiteBookings } from "@/server/booking-expiry";
import { getClinicSetting } from "@/server/clinic-setting";
import { isExclusionViolation, isUniqueViolation } from "@/server/db-errors";
import { loadOnlineService, onlineBranchId } from "@/server/online-store";
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
      select: {
        id: true,
        slug: true,
        durationMin: true,
        requiresDoctor: true,
        isActive: true,
        category: { select: { slug: true } },
      },
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

export type SiteBookingInput = {
  holdToken: string;
  serviceId: string;
  staffId: string;
  branchId: string;
  /** ISO string dari slot yang ditahan. */
  startAt: string;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

/** Bagian kwitansi khusus konsultasi online (spec 4.4). Hanya teks dan angka, aman disimpan di sessionStorage. */
export type OnlineReceipt = { windowLines: string[]; servicePrice: number; total: number; maskedWhatsapp: string };

export type BookingReceipt = {
  code: string;
  patientName: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  startAt: Date;
  bookingFee: number | null;
  /** "BCA 123… a.n. …", atau null bila rekening belum diisi di pengaturan. */
  bankAccount: string | null;
  confirmationLink: string;
  online: OnlineReceipt | null;
};

export type SubmitOutcome = { kind: "booked"; receipt: BookingReceipt } | { kind: "slot-taken" };

const submitLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const GENERIC_FAILURE = "Pendaftaran gagal dikirim. Muat ulang halaman lalu coba lagi.";

async function findSubmitted(holdToken: string): Promise<string | null> {
  const intake = await prisma.intake.findUnique({
    where: { submissionKey: holdToken },
    select: { appointmentId: true },
  });
  return intake?.appointmentId ?? null;
}

async function buildReceipt(appointmentId: string): Promise<BookingReceipt> {
  const [appointment, setting] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        code: true,
        channel: true,
        startAt: true,
        bookingFee: true,
        servicePrice: true,
        service: { select: { name: true } },
        staff: { select: { name: true } },
        branch: { select: { name: true } },
        intake: { select: { name: true, whatsapp: true } },
        contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
      },
    }),
    getClinicSetting(),
  ]);
  const patientName = appointment.intake?.name ?? "";
  const serviceName = appointment.service?.name ?? "Konsultasi Dokter";

  if (appointment.channel === "ONLINE") {
    const total = onlineTotal(appointment);
    return {
      code: appointment.code,
      patientName,
      serviceName,
      staffName: appointment.staff.name,
      branchName: ONLINE_BRANCH_LABEL,
      startAt: appointment.startAt,
      bookingFee: appointment.bookingFee,
      bankAccount: formatBankAccount(setting),
      confirmationLink: buildWhatsAppLink(
        onlineSiteBookingWhatsAppMessage({ patientName, code: appointment.code, staffName: appointment.staff.name, total }),
      ),
      online: {
        windowLines: windowLines(appointment.contactWindows),
        servicePrice: appointment.servicePrice ?? 0,
        total,
        maskedWhatsapp: maskWhatsapp(appointment.intake?.whatsapp ?? ""),
      },
    };
  }

  const timeLabel = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));
  return {
    code: appointment.code,
    patientName,
    serviceName,
    staffName: appointment.staff.name,
    branchName: appointment.branch.name,
    startAt: appointment.startAt,
    bookingFee: appointment.bookingFee,
    bankAccount: formatBankAccount(setting),
    confirmationLink: buildWhatsAppLink(
      siteBookingWhatsAppMessage({
        patientName,
        code: appointment.code,
        serviceName,
        staffName: appointment.staff.name,
        branchName: appointment.branch.name,
        dateLabel: formatIndonesianDate(appointment.startAt),
        timeLabel,
        bookingFee: appointment.bookingFee,
      }),
    ),
    online: null,
  };
}

/** Pasien baru dan pasien non-Aesthetic hanya memesan Konsultasi Dokter (K9). */
function assertServiceFits(service: { slug: string; category: { slug: string } }, answers: QuizAnswers) {
  if (service.slug === CONSULTATION_SERVICE_SLUG) return;
  const mayChooseTreatment = answers.patientType === "LAMA" && answers.purpose === "AESTHETIC";
  if (!mayChooseTreatment || service.category.slug === SLIMMING_CATEGORY_SLUG) {
    throw new UserFacingError(
      "Silakan pilih Konsultasi Dokter. Treatment ditentukan dokter setelah pemeriksaan.",
    );
  }
}

type ValidIdentity = Extract<ReturnType<typeof validateIdentity>, { ok: true }>["identity"];

/** Isian dari kiriman /daftar, sama untuk booking klinik dan online. */
function siteIntake(
  answers: QuizAnswers,
  identity: ValidIdentity,
  patientType: "BARU" | "LAMA",
  now: Date,
  submissionKey: string,
): Omit<Prisma.IntakeUncheckedCreateInput, "appointmentId"> {
  return {
    status: "TERISI",
    kind: patientType === "LAMA" ? "PENDEK" : "LENGKAP",
    purpose: answers.purpose,
    claimsReturning: patientType === "LAMA",
    quizVersion: QUIZ_VERSION,
    answers: answersForStorage(answers) as Prisma.InputJsonValue,
    name: identity.name,
    whatsapp: identity.whatsapp,
    birthDate: new Date(`${identity.birthDate}T00:00:00Z`),
    gender: identity.gender,
    occupation: identity.occupation,
    address: identity.address,
    selfWeightKg: answers.body?.weightKg,
    selfHeightCm: answers.body?.heightCm,
    consentAt: now,
    consentVersion: PRIVACY_POLICY_VERSION,
    submittedAt: now,
    submissionKey,
  };
}

/**
 * Satu transaksi: hold dilepas, booking dibuat, isian dibuat. Exclusion
 * constraint Appointment tetap jaminan akhir anti-bentrok. Kode SDY-XXXX
 * kembar (±1 per sejuta) dicoba ulang dengan kode lain.
 */
async function createSiteBooking(
  appointment: Omit<Prisma.AppointmentUncheckedCreateInput, "code">,
  intake: Omit<Prisma.IntakeUncheckedCreateInput, "appointmentId">,
  holdToken: string,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.slotHold.deleteMany({ where: { token: holdToken } });
        const created = await tx.appointment.create({
          data: { ...appointment, code: generateBookingCode() },
          select: { id: true },
        });
        await tx.intake.create({ data: { ...intake, appointmentId: created.id } });
        return created.id;
      });
    } catch (error) {
      const codeCollision = isUniqueViolation(error) && !(await findSubmitted(holdToken));
      if (codeCollision && attempt < 3) continue;
      throw error;
    }
  }
}

export async function submitSiteBooking(input: SiteBookingInput): Promise<ActionResult<SubmitOutcome>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);
    if (typeof input.holdToken !== "string" || input.holdToken.length < 16) {
      throw new UserFacingError("Pilih jadwal lebih dulu.");
    }

    // Kirim ulang (sinyal putus, tombol ditekan dua kali): kembalikan booking yang sama.
    const previous = await findSubmitted(input.holdToken);
    if (previous) return { kind: "booked", receipt: await buildReceipt(previous) };

    if (input.consentData !== true || input.consentFee !== true) {
      throw new UserFacingError("Centang kedua persetujuan untuk melanjutkan.");
    }

    const quiz = validateQuizAnswers(input.answers, { askPatientType: true });
    if (!quiz.ok) throw new UserFacingError(quiz.message);
    const answers = quiz.answers;
    const patientType = answers.patientType;
    if (!patientType) throw new UserFacingError(GENERIC_FAILURE);

    const checked = validateIdentity(input.identity, patientType);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const identity = checked.identity;

    const now = new Date();
    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime()) || startAt <= now || !isBookableDate(witaDateString(startAt), now)) {
      throw new UserFacingError("Jadwal ini sudah lewat. Pilih jam lain.");
    }

    // Sama seperti holdSlot: "siapa saja" sudah diselesaikan client jadi satu
    // staffId nyata sebelum Kirim — permintaan mentah tanpa staffId tidak
    // boleh diam-diam jatuh ke staf pertama yang kosong lewat eligibleStaff.
    if (typeof input.staffId !== "string" || !input.staffId) {
      throw new UserFacingError("Tenaga ini tidak menangani layanan tersebut.");
    }

    const [service, setting] = await Promise.all([
      loadServiceAndBranch(input.serviceId, input.branchId),
      getClinicSetting(),
    ]);
    assertServiceFits(service, answers);
    const [staff] = await eligibleStaff(service, input.staffId);

    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

    // Jam yang dikirim harus sama dengan jam yang ditahan token ini — token
    // buatan (tanpa hold nyata, atau jam berbeda dari holdnya) tidak boleh
    // memesan langsung tanpa lewat pemeriksaan jadwal & lead time computeAvailability.
    const hold = await prisma.slotHold.findUnique({
      where: { token: input.holdToken },
      select: { staffId: true, branchId: true, startAt: true, endAt: true, expiresAt: true },
    });
    if (hold) {
      const matchesHold =
        hold.staffId === staff.id &&
        hold.branchId === input.branchId &&
        hold.startAt.getTime() === startAt.getTime() &&
        hold.endAt.getTime() === endAt.getTime();
      if (!matchesHold) {
        throw new UserFacingError("Jadwal tidak cocok dengan jam yang ditahan. Pilih jam lagi.");
      }
    }
    // Hold yang sudah habis (barisnya sudah dibersihkan atau belum) tidak lagi
    // menjamin apa pun: jam ini tetap boleh dibooking bila memang masih kosong,
    // termasuk jadwal, libur, dan lead time (spec 5.4).
    if (!hold || hold.expiresAt <= now) {
      const offered = await computeAvailability(
        { staffId: staff.id, branchId: input.branchId, date: witaDateString(startAt), durationMinutes: service.durationMin },
        { minLeadMinutes: PUBLIC_MIN_LEAD_MINUTES, holds: { excludeToken: input.holdToken } },
      );
      const stillOpen = offered.some((slot) => slot.startAt.getTime() === startAt.getTime());
      if (!stillOpen) return { kind: "slot-taken" };
    }

    await expireStaleSiteBookings(now);

    let appointmentId: string;
    try {
      appointmentId = await createSiteBooking(
        {
          type: service.slug === CONSULTATION_SERVICE_SLUG ? "KONSULTASI" : "TREATMENT",
          startAt,
          endAt,
          source: "SITUS",
          branchId: input.branchId,
          staffId: staff.id,
          serviceId: service.id,
          patientId: null,
          bookingFee: bookingFeeFor("SITUS", setting.bookingFee),
        },
        siteIntake(answers, identity, patientType, now, input.holdToken),
        input.holdToken,
      );
    } catch (error) {
      // Dua Kirim bersamaan dengan token yang sama: yang kalah bisa gagal di
      // batas unik isian (P2002) atau di exclusion constraint jadwal (23P01,
      // karena jam itu sudah diambil pemenang), dan keduanya mengembalikan
      // booking pemenang. Hanya bila tidak ada booking untuk token ini, jam itu
      // memang direbut orang lain.
      const conflict = isExclusionViolation(error) || isUniqueViolation(error);
      const raced = conflict ? await findSubmitted(input.holdToken) : null;
      if (raced) return { kind: "booked", receipt: await buildReceipt(raced) };
      if (isExclusionViolation(error)) return { kind: "slot-taken" };
      throw error;
    }

    const receipt = await buildReceipt(appointmentId);
    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.site-create",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${receipt.code} — ${startAt.toISOString()}`,
    });
    safeRevalidatePath("/admin/booking");
    return { kind: "booked", receipt };
  });
}

export type OnlineBookingInput = {
  /** Kunci kiriman buatan browser; kiriman ulang dengan kunci yang sama mengembalikan booking yang sama. */
  submissionKey: string;
  staffId: string;
  windows: unknown;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

const ONLINE_UNAVAILABLE = "Konsultasi online sedang tidak tersedia. Silakan pilih datang ke klinik.";

/**
 * Konsultasi online dari /daftar (spec 4): tanpa slot dan tanpa hold. Rentang waktu luang,
 * dokter, layanan, dan biaya diperiksa ulang di sini; booking dan isian dibuat dalam satu transaksi.
 */
export async function submitOnlineBooking(input: OnlineBookingInput): Promise<ActionResult<{ receipt: BookingReceipt }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);
    const key = input.submissionKey;
    if (typeof key !== "string" || key.length < 16 || key.length > 100) throw new UserFacingError(GENERIC_FAILURE);

    const previous = await findSubmitted(key);
    if (previous) return { receipt: await buildReceipt(previous) };

    if (input.consentData !== true || input.consentFee !== true) {
      throw new UserFacingError("Centang kedua persetujuan untuk melanjutkan.");
    }
    const quiz = validateQuizAnswers(input.answers, { askPatientType: true });
    if (!quiz.ok) throw new UserFacingError(quiz.message);
    const answers = quiz.answers;
    const patientType = answers.patientType;
    if (!patientType) throw new UserFacingError(GENERIC_FAILURE);
    const checked = validateIdentity(input.identity, patientType);
    if (!checked.ok) throw new UserFacingError(checked.message);

    const now = new Date();
    const windows = validateContactWindows(input.windows, { now, audience: "CUSTOMER" });
    if (!windows.ok) throw new UserFacingError(windows.message);
    if (typeof input.staffId !== "string" || !input.staffId) throw new UserFacingError("Pilih dokter lebih dulu.");

    const [service, branchId, setting] = await Promise.all([loadOnlineService(), onlineBranchId(), getClinicSetting()]);
    if (!service || !branchId) throw new UserFacingError(ONLINE_UNAVAILABLE);
    const [doctor] = await eligibleStaff({ requiresDoctor: true }, input.staffId);
    const first = boundsOf(windows.windows);

    let appointmentId: string;
    try {
      appointmentId = await createSiteBooking(
        {
          type: "KONSULTASI",
          channel: "ONLINE",
          startAt: first.startAt,
          endAt: first.endAt,
          source: "SITUS",
          branchId,
          staffId: doctor.id,
          serviceId: service.id,
          patientId: null,
          bookingFee: bookingFeeFor("SITUS", setting.bookingFee),
          servicePrice: service.promoPrice,
          contactWindows: { create: windows.windows.map((w) => ({ startAt: w.startAt, endAt: w.endAt })) },
        },
        siteIntake(answers, checked.identity, patientType, now, key),
        key,
      );
    } catch (error) {
      // Dua Kirim bersamaan dengan kunci yang sama: yang kalah gagal di batas unik isian.
      const raced = isUniqueViolation(error) ? await findSubmitted(key) : null;
      if (raced) return { receipt: await buildReceipt(raced) };
      throw error;
    }

    const receipt = await buildReceipt(appointmentId);
    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.site-create",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${receipt.code} — online, ${windows.windows.length} waktu luang`,
    });
    safeRevalidatePath("/admin/booking");
    return { receipt };
  });
}

export type PublicBookingStatus = {
  code: string;
  status: AppointmentStatusValue;
  statusLabel: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  startAt: Date;
  maskedWhatsapp: string;
  bookingFee: number | null;
  canCancel: boolean;
  canReschedule: boolean;
  rescheduleLink: string | null;
  channel: "KLINIK" | "ONLINE";
  /** Rentang waktu luang booking online (spec 4.5); kosong untuk booking klinik. */
  windowLines: string[];
  /** Tautan WA ke klinik untuk mengganti waktu atau membatalkan konsultasi online. */
  onlineChangeLink: string | null;
};

const lookupLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const cancelLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

// Tebakan 4 digit salah per kode booking, dipakai bersama oleh cek status dan
// batal. Menghitung per kode (bukan per IP) menahan penebakan dari banyak
// alamat; kode yang sudah habis jatahnya tampak persis seperti "tidak ditemukan".
const wrongDigitsLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });

// Kode asli berformat SDY-XXXX. Yang jauh lebih panjang pasti salah dan tidak
// disimpan sebagai kunci pembatas, yang hidup di memori proses.
const MAX_CODE_LENGTH = 32;

const ACTIVE: AppointmentStatusValue[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

function parseLookup(input: { code: string; last4: string }) {
  const code = String(input.code ?? "").trim().toUpperCase();
  const last4 = String(input.last4 ?? "").trim();
  if (!code || !/^\d{4}$/.test(last4)) {
    throw new UserFacingError("Isi kode booking dan 4 digit terakhir nomor WhatsApp.");
  }
  return { code, last4 };
}

/**
 * Booking yang cocok dengan kode DAN 4 digit terakhir WA, atau null.
 * Kode salah dan digit salah sengaja memberi jawaban yang sama, agar kode
 * orang lain tidak bisa ditebak lewat perbedaan pesan (PRD F6).
 */
async function findOwnBooking(code: string, last4: string) {
  if (code.length > MAX_CODE_LENGTH) return null;
  // Jatah dicatat sebelum kueri, agar tebakan serentak tidak lolos bersama-sama
  // sebelum hitungannya bertambah. Digit yang benar mengembalikannya di bawah.
  if (!wrongDigitsLimiter.take(code)) return null;
  const appointment = await prisma.appointment.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      status: true,
      startAt: true,
      bookingFee: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      branch: { select: { name: true } },
      patient: { select: { whatsapp: true } },
      intake: { select: { whatsapp: true } },
      channel: true,
      contactWindows: { orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } },
    },
  });
  // Nomor yang diketik pemesan (isian) didahulukan: setelah admin mencocokkan
  // booking dengan pasien lama bernomor lain, pemesan tidak boleh terkunci, dan
  // situs tidak boleh membocorkan bahwa orang itu pasien lama (spec 1/K4).
  // Booking admin tidak punya isian, jadi memakai nomor pasiennya.
  const whatsapp = appointment?.intake?.whatsapp ?? appointment?.patient?.whatsapp;
  if (!appointment || !whatsapp || !whatsapp.endsWith(last4)) return null;
  wrongDigitsLimiter.undo(code);
  return { ...appointment, whatsapp };
}

function toPublicStatus(
  booking: NonNullable<Awaited<ReturnType<typeof findOwnBooking>>>,
  now: Date,
): PublicBookingStatus {
  if (booking.channel === "ONLINE") {
    return {
      code: booking.code,
      status: booking.status,
      statusLabel: STATUS_LABEL[booking.status],
      serviceName: booking.service?.name ?? "Konsultasi Online",
      staffName: booking.staff.name,
      branchName: ONLINE_BRANCH_LABEL,
      startAt: booking.startAt,
      maskedWhatsapp: maskWhatsapp(booking.whatsapp),
      bookingFee: booking.bookingFee,
      canCancel: false,
      canReschedule: false,
      rescheduleLink: null,
      channel: "ONLINE",
      windowLines: windowLines(booking.contactWindows),
      onlineChangeLink: ACTIVE.includes(booking.status) ? buildWhatsAppLink(onlineChangeRequestMessage(booking.code)) : null,
    };
  }
  const changeable = canPatientChange(booking.startAt, now);
  const canReschedule = booking.status === "TERKONFIRMASI" && changeable;
  return {
    code: booking.code,
    status: booking.status,
    statusLabel: STATUS_LABEL[booking.status],
    serviceName: booking.service?.name ?? "Konsultasi Dokter",
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    startAt: booking.startAt,
    maskedWhatsapp: maskWhatsapp(booking.whatsapp),
    bookingFee: booking.bookingFee,
    canCancel: ACTIVE.includes(booking.status) && changeable,
    canReschedule,
    rescheduleLink: canReschedule
      ? buildWhatsAppLink(
          rescheduleRequestMessage({
            code: booking.code,
            dateLabel: formatIndonesianDate(booking.startAt),
            timeLabel: minutesToTimeLabel(witaMinutesOfDay(booking.startAt)),
          }),
        )
      : null,
    channel: "KLINIK",
    windowLines: [],
    onlineChangeLink: null,
  };
}

export async function findBookingStatus(input: {
  code: string;
  last4: string;
}): Promise<ActionResult<PublicBookingStatus | null>> {
  return runAction(async () => {
    await guardRate(lookupLimiter);
    const { code, last4 } = parseLookup(input);
    await expireStaleSiteBookings();
    const booking = await findOwnBooking(code, last4);
    return booking ? toPublicStatus(booking, new Date()) : null;
  });
}

export async function cancelSiteBooking(input: {
  code: string;
  last4: string;
}): Promise<ActionResult<PublicBookingStatus>> {
  return runAction(async () => {
    await guardRate(cancelLimiter);
    const { code, last4 } = parseLookup(input);
    await expireStaleSiteBookings();

    const booking = await findOwnBooking(code, last4);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan. Periksa kode dan nomor WhatsApp.");
    if (booking.channel === "ONLINE") {
      throw new UserFacingError("Untuk membatalkan konsultasi online, hubungi kami lewat WhatsApp.");
    }
    const now = new Date();
    if (!ACTIVE.includes(booking.status)) {
      throw new UserFacingError(`Booking ini sudah berstatus ${STATUS_LABEL[booking.status].toLowerCase()}.`);
    }
    if (!canPatientChange(booking.startAt, now)) {
      throw new UserFacingError(
        "Pembatalan lewat situs hanya sampai 2 jam sebelum jadwal. Hubungi kami lewat WhatsApp.",
      );
    }

    const { count } = await prisma.appointment.updateMany({
      where: { id: booking.id, status: { in: ACTIVE } },
      data: { status: "DIBATALKAN" },
    });
    if (count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "appointment.cancel-by-patient",
      entity: "Appointment",
      entityId: booking.id,
      summary: booking.code,
    });
    safeRevalidatePath("/admin/booking");
    return toPublicStatus({ ...booking, status: "DIBATALKAN" }, now);
  });
}
