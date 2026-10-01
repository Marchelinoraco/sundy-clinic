"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MISSING_BANK_ACCOUNT_LINE, type TransferInstruction } from "@/lib/transfer-instruction";
import { WhatsAppSendButton } from "./whatsapp-send-button";

export type CreatedBooking = {
  id: string;
  code: string;
  /** Tanggal jadwal (WITA, "YYYY-MM-DD"), untuk "Lihat di daftar". */
  date: string;
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
}: {
  booking: CreatedBooking;
  /** Tanggal jadwal singkat, misal "Sen, 5 Okt". */
  dateLabel: string;
  onNew: () => void;
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
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
      <h2 className="font-medium">✓ Booking {booking.code} dibuat</h2>

      {booking.instructionFailed && (
        <p className="text-sm text-destructive">
          Instruksi transfer gagal dimuat. Buka booking ini di daftar untuk mengirimnya.
        </p>
      )}

      {instruction && (
        <div className="space-y-2">
          {instruction.missingBankAccount && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
              Rekening belum diisi di Pengaturan. Teks menulis &quot;{MISSING_BANK_ACCOUNT_LINE}&quot;.
            </p>
          )}
          {instruction.link ? (
            <WhatsAppSendButton
              href={instruction.link}
              appointmentId={booking.id}
              kind="INSTRUKSI_TRANSFER"
              className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
            >
              Kirim instruksi transfer via WA
            </WhatsAppSendButton>
          ) : (
            <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => copy(instruction.text)}>
            Salin teks
          </Button>
        </div>
      )}

      <Button asChild variant="outline" className="w-full">
        <Link href={`/admin/booking?tanggal=${booking.date}&sorot=${booking.id}`}>Lihat di daftar ({dateLabel})</Link>
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onNew}>
        + Booking baru
      </Button>
    </div>
  );
}
