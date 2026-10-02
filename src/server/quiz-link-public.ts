"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateLinkIdentity } from "@/lib/kuis/identity";
import { answersForStorage } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { validateQuizAnswers } from "@/lib/kuis/v2/steps";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import {
  firstName,
  missingIdentityFields,
  needsFeeConsent,
  patientTypeForKind,
  quizKindFor,
  quizLinkState,
  quizLinkVersion,
  type QuizLinkPage,
} from "@/lib/quiz-link";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeRevalidatePath } from "@/lib/revalidate";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { isValidQuizLinkCode, parseQuizLinkCode } from "@/server/quiz-link-code";
import { hasCompletedFullIntake, loadLinkBooking, type LinkBooking } from "@/server/quiz-link-store";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Kode link adalah satu-satunya bukti, jadi diperiksa ulang di setiap aksi.

const pageLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const submitLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

const LINK_CLOSED = "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.";
const GENERIC_FAILURE = "Form gagal dikirim. Muat ulang halaman lalu coba lagi.";

export type QuizLinkSubmission = {
  code: string;
  answers: unknown;
  identity: unknown;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan: tersembunyi dari manusia, diisi bot. */
  website: string;
};

class AlreadySubmitted extends Error {}

/** Booking pemilik kode, atau null bila kode rusak, palsu, atau sudah diganti. */
async function bookingForCode(code: unknown): Promise<LinkBooking | null> {
  const parsed = parseQuizLinkCode(code);
  if (!parsed) return null;
  const booking = await loadLinkBooking(parsed.appointmentId);
  if (!booking) return null;
  return isValidQuizLinkCode(code as string, quizLinkVersion(booking)) ? booking : null;
}

/** Isi halaman /isi. Hanya nama depan dan jadwal: nomor WA dan data medis tidak pernah dikirim. */
export async function getQuizLinkPage(code: string): Promise<ActionResult<QuizLinkPage>> {
  return runAction(async () => {
    await guardRate(pageLimiter);
    const booking = await bookingForCode(code);
    if (!booking) return { state: "CLOSED" };
    const state = quizLinkState(booking, new Date());
    if (state !== "OPEN") return { state };
    const patient = booking.patient!;
    return {
      state: "OPEN",
      firstName: firstName(patient.name),
      serviceName: bookingServiceName(booking),
      startAt: booking.startAt,
      staffName: booking.staff.name,
      branchName: booking.branch.name,
      kind: quizKindFor(await hasCompletedFullIntake(booking.patientId!)),
      missing: missingIdentityFields(patient),
      feeConsent: needsFeeConsent(booking) ? { bookingFee: booking.bookingFee! } : null,
    };
  });
}

/**
 * Kirim kuis dari link (spec C3 3.3): isian dibuat atau diisi (TERISI), lalu
 * data diri hanya melengkapi kolom pasien yang masih kosong — dalam satu
 * transaksi. Kiriman kedua mendapat "sudah diterima", tanpa isian ganda.
 */
export async function submitQuizLink(input: QuizLinkSubmission): Promise<ActionResult<{ state: "SUBMITTED" }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input.website) throw new UserFacingError(GENERIC_FAILURE);

    const booking = await bookingForCode(input.code);
    if (!booking) throw new UserFacingError(LINK_CLOSED);
    const now = new Date();
    // Kirim diterima sampai jam selesai, walau link sudah tidak bisa dibuka sejak jam mulai.
    const state = quizLinkState(booking, now, booking.endAt);
    if (state === "SUBMITTED") return { state: "SUBMITTED" };
    if (state !== "OPEN") throw new UserFacingError(LINK_CLOSED);
    const patientId = booking.patientId!;
    const patient = booking.patient!;

    if (input.consentData !== true) throw new UserFacingError("Centang persetujuan data untuk melanjutkan.");
    if (needsFeeConsent(booking) && input.consentFee !== true) {
      throw new UserFacingError("Centang persetujuan biaya booking untuk melanjutkan.");
    }

    const kind = quizKindFor(await hasCompletedFullIntake(patientId));
    const quiz = validateQuizAnswers(input.answers, { askPatientType: false });
    if (!quiz.ok) throw new UserFacingError(quiz.message);
    if (quiz.answers.patientType !== patientTypeForKind(kind)) {
      throw new UserFacingError("Form ini sudah diperbarui. Muat ulang halaman lalu isi lagi.");
    }
    const answers = quiz.answers;

    const checked = validateLinkIdentity(input.identity, missingIdentityFields(patient), now);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const filled = checked.identity;
    const birthDate = filled.birthDate ? new Date(`${filled.birthDate}T00:00:00Z`) : patient.birthDate;

    const data = {
      status: "TERISI" as const,
      kind,
      purpose: answers.purpose,
      quizVersion: QUIZ_VERSION,
      answers: answersForStorage(answers) as Prisma.InputJsonValue,
      patientId,
      name: patient.name,
      whatsapp: patient.whatsapp,
      birthDate,
      gender: filled.gender ?? patient.gender,
      occupation: filled.occupation ?? patient.occupation,
      address: filled.address ?? patient.address,
      selfWeightKg: answers.body?.weightKg,
      selfHeightCm: answers.body?.heightCm,
      consentAt: now,
      consentVersion: PRIVACY_POLICY_VERSION,
      submittedAt: now,
    };

    let intakeId: string;
    try {
      intakeId = await prisma.$transaction(async (tx) => {
        let id: string;
        if (booking.intake) {
          // Hanya baris yang masih menunggu: isian TERISI tidak pernah diubah.
          const { count } = await tx.intake.updateMany({
            where: { id: booking.intake.id, status: "MENUNGGU_DIISI" },
            data,
          });
          if (count === 0) throw new AlreadySubmitted();
          id = booking.intake.id;
        } else {
          id = (await tx.intake.create({ data: { ...data, appointmentId: booking.id }, select: { id: true } })).id;
        }
        // Melengkapi kolom yang masih kosong saja; kolom yang terisi tidak pernah ditimpa.
        if (filled.birthDate) {
          await tx.patient.updateMany({ where: { id: patientId, birthDate: null }, data: { birthDate } });
        }
        if (filled.gender) {
          await tx.patient.updateMany({ where: { id: patientId, gender: null }, data: { gender: filled.gender } });
        }
        if (filled.occupation) {
          await tx.patient.updateMany({
            where: { id: patientId, OR: [{ occupation: null }, { occupation: "" }] },
            data: { occupation: filled.occupation },
          });
        }
        if (filled.address) {
          await tx.patient.updateMany({
            where: { id: patientId, OR: [{ address: null }, { address: "" }] },
            data: { address: filled.address },
          });
        }
        return id;
      });
    } catch (error) {
      // Dua Kirim bersamaan: yang kalah mendapati isian sudah terisi, atau menabrak batas unik per booking.
      if (error instanceof AlreadySubmitted || isUniqueViolation(error)) return { state: "SUBMITTED" };
      throw error;
    }

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "intake.link-submit",
      entity: "Intake",
      entityId: intakeId,
      summary: booking.code,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pengingat");
    return { state: "SUBMITTED" };
  });
}
