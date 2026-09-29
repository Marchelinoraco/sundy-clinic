import type { Metadata } from "next";
import { RegistrationFlow } from "@/components/pendaftaran/registration-flow";
import { getBookingOptions } from "@/server/public-booking-data";

export const metadata: Metadata = {
  title: "Daftar Konsultasi",
  description: "Daftar konsultasi Slimming atau Aesthetic di SunDY Clinic secara online.",
  // Dibuka untuk mesin pencari di Task 20, setelah pemilik mencoba alurnya.
  robots: { index: false, follow: false },
};

// Biaya booking dan layanan dibaca langsung dari basis data setiap kali.
export const dynamic = "force-dynamic";

export default async function RegistrationPage() {
  const options = await getBookingOptions();
  return <RegistrationFlow options={options} />;
}
