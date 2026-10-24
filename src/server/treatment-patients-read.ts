import type { WhatsAppMessage } from "@/lib/booking-messages";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { treatmentNamesLabel, treatmentReminderMessage } from "@/lib/treatment-reminder";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { requireCapability } from "@/server/session";
import { lastTreatmentReminders, latestTreatmentVisits, returnFlags } from "@/server/treatment-visits";

// Tab "Pasien treatment" di halaman Pengingat (spec pengingat treatment PT10, PT12, PT14).

export const TREATMENT_PATIENTS_PAGE_SIZE = 50;
/** Pilihan saringan "Treatment terakhir lebih dari {n} minggu lalu". */
export const OLDER_THAN_WEEKS = [1, 2, 4, 8] as const;

export type TreatmentPatientRow = {
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  treatments: string;
  treatmentOn: string;
  intervalDays: number;
  lastReminder: { sentAt: Date; staffName: string } | null;
  /** "punya booking …", "paket aktif · kunjungan berikutnya …", "sudah datang lagi …". */
  markers: string[];
  message: WhatsAppMessage;
};

/** Semua pasien yang pernah treatment, treatment terbaru dulu; tanda hanya memberi tahu, pasien tetap bisa dikirimi. */
export async function listTreatmentPatients(filter: { q?: string; olderThanWeeks?: number; page?: number }): Promise<{
  rows: TreatmentPatientRow[];
  total: number;
  page: number;
  pageSize: typeof TREATMENT_PATIENTS_PAGE_SIZE;
}> {
  await requireCapability("booking:manage");
  const today = witaDateString(new Date());
  const q = (filter.q ?? "").trim().toLowerCase();
  const weeks = (OLDER_THAN_WEEKS as readonly number[]).includes(filter.olderThanWeeks ?? 0) ? (filter.olderThanWeeks as number) : null;
  const before = weeks ? addDaysToDateString(today, -weeks * 7) : null;

  const visits = (await latestTreatmentVisits(prisma))
    .filter((visit) => !q || visit.patientName.toLowerCase().includes(q) || visit.treatments.some((name) => name.toLowerCase().includes(q)))
    .filter((visit) => !before || visit.treatmentOn < before)
    .sort((a, b) => b.treatmentOn.localeCompare(a.treatmentOn) || a.patientName.localeCompare(b.patientName));
  const total = visits.length;
  const lastPage = Math.max(1, Math.ceil(total / TREATMENT_PATIENTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filter.page ?? 1) || 1), lastPage);
  const shown = visits.slice((page - 1) * TREATMENT_PATIENTS_PAGE_SIZE, page * TREATMENT_PATIENTS_PAGE_SIZE);

  const [flags, reminders] = await Promise.all([returnFlags(prisma, shown, today), lastTreatmentReminders(prisma, shown.map((visit) => visit.patientId))]);
  const rows = shown.map((visit): TreatmentPatientRow => {
    const flag = flags.get(visit.patientId);
    const markers = [
      flag?.upcomingBookingOn ? `punya booking ${dateLabel(flag.upcomingBookingOn)}` : null,
      flag?.packageVisitOn ? `paket aktif · kunjungan berikutnya ${dateLabel(flag.packageVisitOn)}` : null,
      flag?.cameBackOn ? `sudah datang lagi ${dateLabel(flag.cameBackOn)}` : null,
    ].filter((marker): marker is string => marker !== null);
    const text = treatmentReminderMessage({ patientName: visit.patientName, treatments: visit.items, treatmentOn: visit.treatmentOn });
    const last = reminders.get(visit.patientId);
    return {
      patientId: visit.patientId,
      patientName: visit.patientName,
      medicalRecordNumber: visit.medicalRecordNumber,
      treatments: treatmentNamesLabel(visit.treatments),
      treatmentOn: visit.treatmentOn,
      intervalDays: visit.intervalDays,
      lastReminder: last ? { sentAt: last.sentAt, staffName: last.staffName } : null,
      markers,
      message: { text, link: buildWhatsAppLinkTo(visit.whatsapp, text) },
    };
  });
  return { rows, total, page, pageSize: TREATMENT_PATIENTS_PAGE_SIZE };
}
