import type { Metadata } from "next";
import { RegistrationFlow } from "@/components/pendaftaran/registration-flow";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { getBookingOptions } from "@/server/public-booking-data";
import { registrationAccess } from "@/server/registration-access";

export const metadata: Metadata = {
  title: "Daftar Konsultasi",
  description: "Daftar konsultasi Slimming atau Aesthetic di SunDY Clinic secara online.",
};

// Biaya booking dan layanan dibaca langsung dari basis data setiap kali.
export const dynamic = "force-dynamic";

/**
 * Jeda sementara pendaftaran online (mis. saat fitur booking sedang diperbaiki),
 * tanpa deploy: set REGISTRATION_CLOSED=true di shared/.env lalu `pm2 restart sundy`,
 * dan kembalikan dengan cara yang sama. REGISTRATION_CLOSED=staff membuka form hanya
 * untuk staf yang sedang login (uji coba). Rute lain tidak terpengaruh.
 */
export default async function RegistrationPage() {
  const access = await registrationAccess();
  if (access === "closed") {
    const link = buildWhatsAppLink("Halo, saya ingin mendaftar konsultasi di SunDY Clinic.");
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-brown-900">Pendaftaran online sedang diperbaiki</h1>
        <p className="text-brown-700">
          Sebentar, kami sedang menyempurnakan sistem pendaftaran. Untuk sekarang, silakan daftar lewat WhatsApp di{" "}
          {CLINIC_WHATSAPP_DISPLAY}.
        </p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-full bg-emerald-700 px-7 py-3 font-medium text-white hover:bg-emerald-800"
        >
          Daftar lewat WhatsApp
        </a>
      </div>
    );
  }

  const options = await getBookingOptions();
  return (
    <>
      {access === "staff-preview" && (
        <p role="status" className="mx-auto mt-4 max-w-2xl rounded-2xl border border-gold-500 bg-cream-100 px-4 py-3 text-center text-sm text-brown-800">
          Mode uji coba: hanya staf yang login yang melihat formulir ini. Booking yang dibuat tercatat sungguhan.
        </p>
      )}
      <RegistrationFlow options={options} />
    </>
  );
}
