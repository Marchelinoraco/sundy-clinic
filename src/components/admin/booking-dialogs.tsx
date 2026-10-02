"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { RescheduleTarget } from "@/lib/booking-actions";
import type { BookingMessage } from "@/lib/booking-messages";
import { getBookingMessage } from "@/server/appointment-message";
import { QuizLinkDialog, type QuizLinkTarget } from "./quiz-link-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { SendMessageDialog } from "./send-message-dialog";

/** Booking yang baru diverifikasi, untuk judul dialog konfirmasi. */
export type ConfirmationTarget = { appointmentId: string; code: string; description: string };

type BookingDialogs = {
  /** Setelah Verifikasi berhasil: muat teks konfirmasi lalu tampilkan dialog kirim (spec C2 3.1). */
  confirmAfterVerify: (target: ConfirmationTarget) => void;
  openReschedule: (target: RescheduleTarget) => void;
  /** Dialog "Link kuis" (spec C3 4.2). */
  openQuizLink: (target: QuizLinkTarget) => void;
};

const BookingDialogsContext = createContext<BookingDialogs | null>(null);

/**
 * Dialog setelah Verifikasi dan Pindah jadwal hidup di atas daftar booking, bukan
 * di dalam tabel. Booking yang diverifikasi atau dipindah bisa keluar dari
 * daftarnya — mis. booking menunggu terakhir, sehingga bagian "Menunggu
 * konfirmasi" hilang — dan dialognya tidak boleh ikut hilang.
 */
export function BookingDialogsProvider({ today, children }: { today: string; children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<(ConfirmationTarget & { message: BookingMessage | null }) | null>(
    null,
  );
  const [reschedule, setReschedule] = useState<RescheduleTarget | null>(null);
  const [quizLink, setQuizLink] = useState<QuizLinkTarget | null>(null);

  const value = useMemo<BookingDialogs>(
    () => ({
      confirmAfterVerify: (target) => {
        getBookingMessage(target.appointmentId)
          .then((result) => {
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setConfirmation({ ...target, message: result.data });
          })
          .catch(() => toast.error("Konfirmasi gagal dimuat. Kirim dari halaman Pengingat."));
      },
      openReschedule: setReschedule,
      openQuizLink: setQuizLink,
    }),
    [],
  );

  return (
    <BookingDialogsContext.Provider value={value}>
      {children}
      {confirmation && (
        <SendMessageDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmation(null);
          }}
          title={`✓ Booking ${confirmation.code} terkonfirmasi`}
          description={confirmation.description}
          appointmentId={confirmation.appointmentId}
          message={confirmation.message}
          sendLabel="Kirim konfirmasi via WA"
          laterNote="Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim."
        />
      )}
      {reschedule && (
        <RescheduleDialog
          key={reschedule.appointmentId}
          target={reschedule}
          today={today}
          open
          onOpenChange={(open) => {
            if (!open) setReschedule(null);
          }}
        />
      )}
      {quizLink && (
        <QuizLinkDialog
          key={quizLink.appointmentId}
          target={quizLink}
          open
          onOpenChange={(open) => {
            if (!open) setQuizLink(null);
          }}
        />
      )}
    </BookingDialogsContext.Provider>
  );
}

export function useBookingDialogs(): BookingDialogs {
  const value = useContext(BookingDialogsContext);
  if (!value) throw new Error("BookingDialogsProvider belum dipasang di atas daftar booking.");
  return value;
}
