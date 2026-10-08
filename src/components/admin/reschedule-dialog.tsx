"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { RescheduleTarget } from "@/lib/booking-actions";
import type { BookingMessage } from "@/lib/booking-messages";
import { formatShortIndonesianDate } from "@/lib/format";
import type { SlotOption } from "@/lib/slot";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { DateStrip } from "./date-strip";
import { MessageActions } from "./message-actions";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SlotPicker } from "./slot-picker";

function scheduleLabel(date: Date): string {
  return `${formatShortIndonesianDate(date)} ${minutesToTimeLabel(witaMinutesOfDay(date))}`;
}

const SEND_LABEL: Record<BookingMessage["kind"], string> = {
  KONFIRMASI: "Kirim konfirmasi jadwal baru via WA",
  INSTRUKSI_TRANSFER: "Kirim instruksi transfer",
};

/**
 * Pindah tanggal dan jam pada booking yang sama (spec C2 bagian 5). Tenaga,
 * cabang, durasi, kode, dan biaya booking tetap.
 */
export function RescheduleDialog({
  target,
  today,
  open,
  onOpenChange,
}: {
  target: RescheduleTarget;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [done, setDone] = useState<{ startAt: Date; message: BookingMessage | null } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!slot) {
      toast.error("Pilih tanggal dan jam baru.");
      return;
    }
    const chosen = slot;
    startTransition(async () => {
      try {
        const result = await rescheduleAppointment(target.appointmentId, {
          startAt: chosen.startAt,
          endAt: chosen.endAt,
        });
        if (!result.ok) {
          toast.error(result.error);
          // Jam yang baru saja direbut booking lain harus hilang dari pilihan.
          setSlot(null);
          setRefreshKey((k) => k + 1);
          return;
        }
        // Jadwal sudah pindah; pesan lanjutan yang gagal dimuat tidak membatalkannya.
        let message: BookingMessage | null = null;
        try {
          const follow = await getBookingMessage(target.appointmentId);
          if (follow.ok) message = follow.data;
        } catch {
          message = null;
        }
        setDone({ startAt: chosen.startAt, message });
      } catch {
        toast.error("Gagal memindah jadwal. Coba lagi.");
      }
    });
  }

  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onClose={close} maxWidth="md" scroll="paper">
      <DialogCloseButton onClick={close} />
      {done ? (
        <>
          <DialogTitle sx={{ pr: 6 }}>Jadwal dipindah</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              {target.patientName} · {target.code} · jadwal baru {scheduleLabel(done.startAt)}
            </DialogContentText>
            {done.message && (
              <MessageActions
                appointmentId={target.appointmentId}
                kind={done.message.kind}
                message={done.message}
                scheduledFor={done.message.scheduledFor}
                sendLabel={SEND_LABEL[done.message.kind]}
                onSent={close}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button type="button" variant="text" onClick={close}>
              Tutup
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle sx={{ pr: 6 }}>Pindah jadwal — {target.code}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 1 }}>
              {target.patientName} · sekarang {scheduleLabel(target.startAt)} · {target.staffName} · {target.branchName}
            </DialogContentText>
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Hanya tanggal dan jam yang berubah. Untuk ganti tenaga atau cabang, batalkan lalu buat booking baru.
              </Typography>
              <DateStrip
                staffId={target.staffId}
                branchId={target.branchId}
                durationMinutes={target.durationMinutes}
                today={today}
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setSlot(null);
                }}
                refreshKey={refreshKey}
                excludeAppointmentId={target.appointmentId}
              />
              {date ? (
                <SlotPicker
                  staffId={target.staffId}
                  branchId={target.branchId}
                  date={date}
                  durationMinutes={target.durationMinutes}
                  selected={slot}
                  onSelect={setSlot}
                  refreshKey={refreshKey}
                  excludeAppointmentId={target.appointmentId}
                />
              ) : (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Pilih tanggal dulu.
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button type="button" variant="text" onClick={close}>
              Batal
            </Button>
            <Button type="button" variant="contained" disabled={pending} onClick={save}>
              {pending ? "Menyimpan…" : "Simpan jadwal baru"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
