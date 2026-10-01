import type { Metadata } from "next";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";
import { bookingCodeFromParam } from "@/lib/booking-code";

export const metadata: Metadata = {
  title: "Cek Status Booking",
  description: "Cek status booking SunDY Clinic dengan kode booking dan 4 digit terakhir nomor WhatsApp.",
};

export default async function BookingStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ kode?: string | string[] }>;
}) {
  const { kode } = await searchParams;
  return <BookingStatusLookup initialCode={bookingCodeFromParam(kode)} />;
}
