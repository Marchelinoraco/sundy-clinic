import { formatRupiah, formatShortIndonesianDate } from "@/lib/format";
import { bookingFeeFor } from "@/lib/payment";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Sumber booking yang dicatat admin; booking situs dibuat customer sendiri. */
export type AdminBookingSource = "WHATSAPP" | "TELEPON" | "WALK_IN";

export const ADMIN_SOURCES: readonly AdminBookingSource[] = ["WHATSAPP", "TELEPON", "WALK_IN"];

export const ADMIN_SOURCE_LABEL: Record<AdminBookingSource, string> = {
  WHATSAPP: "WhatsApp",
  TELEPON: "Telepon",
  WALK_IN: "Walk-in",
};

export type SummaryItem = { label: string; value: string | null };

/** Isi ringkasan di kolom kanan Booking Baru (spec C1 bagian 3); null tampil sebagai "belum dipilih". */
export function bookingSummaryItems(input: {
  patientName: string | null;
  serviceName: string | null;
  startAt: Date | null;
  staffName: string | null;
  branchName: string | null;
  source: AdminBookingSource;
  /** Biaya dari Pengaturan; yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
}): SummaryItem[] {
  const fee = bookingFeeFor(input.source, input.bookingFee);
  return [
    { label: "Pasien", value: input.patientName },
    { label: "Layanan", value: input.serviceName },
    {
      label: "Jadwal",
      value: input.startAt
        ? `${formatShortIndonesianDate(input.startAt)} · ${minutesToTimeLabel(witaMinutesOfDay(input.startAt))}`
        : null,
    },
    { label: "Tenaga", value: input.staffName },
    { label: "Cabang", value: input.branchName },
    { label: "Sumber", value: ADMIN_SOURCE_LABEL[input.source] },
    { label: "Biaya booking", value: fee === null ? "tanpa biaya booking" : formatRupiah(fee) },
  ];
}

export function BookingSummary({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex justify-between gap-3 py-1.5">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn("text-right", item.value ? "font-medium" : "text-muted-foreground")}>
            {item.value ?? "belum dipilih"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
