import type { Metadata } from "next";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";

export const metadata: Metadata = {
  title: "Cek Status Booking",
  description: "Cek status booking SunDY Clinic dengan kode booking dan 4 digit terakhir nomor WhatsApp.",
};

export default function BookingStatusPage() {
  return <BookingStatusLookup />;
}
