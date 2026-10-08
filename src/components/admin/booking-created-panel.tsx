"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { toast } from "sonner";
import { MISSING_BANK_ACCOUNT_LINE, type TransferInstruction } from "@/lib/transfer-instruction";
import { WhatsAppSendButton } from "./whatsapp-send-button";

export type CreatedBooking = {
  id: string;
  code: string;
  /** Tanggal jadwal (WITA, "YYYY-MM-DD"), untuk "Lihat di daftar". */
  date: string;
  /** Jadwal yang tertulis di instruksi transfer, untuk mencatat pengirimannya. */
  startAt: Date;
  /** null untuk walk-in atau booking tanpa biaya. */
  instruction: TransferInstruction | null;
  /** Booking tersimpan, tetapi instruksinya gagal dimuat. */
  instructionFailed: boolean;
};

/** Pengganti ringkasan setelah Buat Booking berhasil (spec C1 bagian 4). */
export function BookingCreatedPanel({
  booking,
  dateLabel,
  onNew,
  listHref,
}: {
  booking: CreatedBooking;
  /** Tanggal jadwal singkat, misal "Sen, 5 Okt". */
  dateLabel: string;
  onNew: () => void;
  /** Tautan daftar; bawaannya daftar tanggal jadwal. Booking online belum punya jam, jadi memakai daftar Menunggu konfirmasi. */
  listHref?: string;
}) {
  const { instruction } = booking;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Instruksi transfer disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, borderColor: "success.main", bgcolor: "rgba(var(--mui-palette-success-mainChannel) / 0.06)" }}
    >
      <Typography component="h2" sx={{ fontWeight: 500 }}>
        ✓ Booking {booking.code} dibuat
      </Typography>

      {booking.instructionFailed && (
        <Typography variant="body2" sx={{ color: "error.main" }}>
          Instruksi transfer gagal dimuat. Buka booking ini di daftar untuk mengirimnya.
        </Typography>
      )}

      {instruction && (
        <Stack spacing={1}>
          {instruction.missingBankAccount && (
            <Alert severity="warning" icon={false}>
              Rekening belum diisi di Pengaturan. Teks menulis &quot;{MISSING_BANK_ACCOUNT_LINE}&quot;.
            </Alert>
          )}
          {instruction.link ? (
            <WhatsAppSendButton href={instruction.link} appointmentId={booking.id} kind="INSTRUKSI_TRANSFER" scheduledFor={booking.startAt} color="success" fullWidth>
              Kirim instruksi transfer via WA
            </WhatsAppSendButton>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nomor WhatsApp pasien tidak dikenali.
            </Typography>
          )}
          <Button type="button" variant="outlined" fullWidth onClick={() => copy(instruction.text)}>
            Salin teks
          </Button>
        </Stack>
      )}

      <Button component={NextLink} href={listHref ?? `/admin/booking?tanggal=${booking.date}&sorot=${booking.id}`} variant="outlined" fullWidth>
        Lihat di daftar ({dateLabel})
      </Button>
      <Button type="button" variant="text" fullWidth onClick={onNew}>
        + Booking baru
      </Button>
    </Paper>
  );
}
