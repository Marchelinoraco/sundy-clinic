import Box from "@mui/material/Box";
import { formatRupiah, formatShortIndonesianDate } from "@/lib/format";
import { bookingFeeFor } from "@/lib/payment";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";

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
    <Box component="dl" sx={{ m: 0, fontSize: "0.875rem" }}>
      {items.map((item, index) => (
        <Box
          key={item.label}
          sx={{ display: "flex", justifyContent: "space-between", gap: 1.5, py: 0.75, borderTop: index === 0 ? 0 : 1, borderColor: "divider" }}
        >
          <Box component="dt" sx={{ color: "text.secondary" }}>
            {item.label}
          </Box>
          <Box component="dd" sx={{ m: 0, textAlign: "right", ...(item.value ? { fontWeight: 500 } : { color: "text.secondary" }) }}>
            {item.value ?? "belum dipilih"}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
