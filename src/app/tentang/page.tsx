import type { Metadata } from "next";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FULL_NAME,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";
import { getActiveDoctors } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description:
    "SunDY — Nutrition, Slimming & Wellness Clinic Manado. Program penurunan berat badan dan perawatan estetika yang ditangani dokter.",
};

export default async function AboutPage() {
  const doctors = await getActiveDoctors();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Tentang {CLINIC_FULL_NAME}</h1>

      <p className="mt-6 leading-relaxed text-brown-700">
        SunDY Clinic adalah klinik nutrisi, slimming, dan wellness di Manado. Kami memadukan program
        penurunan berat badan yang diawasi dokter dengan perawatan estetika, sehingga perubahan yang
        Anda capai terlihat sekaligus terasa. {CLINIC_TAGLINE}. {CLINIC_BEAUTY_TAGLINE}.
      </p>

      <p className="mt-4 leading-relaxed text-brown-700">
        Setiap program dimulai dari konsultasi dan Timbang BIA untuk mengetahui komposisi tubuh Anda
        — bukan sekadar angka di timbangan — agar rencana yang disusun benar-benar sesuai kondisi
        Anda.
      </p>

      <section className="mt-12" aria-labelledby="tim-dokter">
        <h2 id="tim-dokter" className="font-display text-2xl text-brown-900">
          Tim Dokter
        </h2>

        <div className="mt-6 grid gap-5">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="rounded-2xl border border-cream-300 bg-white p-6">
              <h3 className="font-display text-xl text-brown-900">{doctor.name}</h3>
              {doctor.specialty && <p className="mt-1 text-sm text-gold-600">{doctor.specialty}</p>}
              {doctor.bio && <p className="mt-3 text-sm text-brown-600">{doctor.bio}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="jam-praktik">
        <h2 id="jam-praktik" className="font-display text-2xl text-brown-900">
          Jam Praktik
        </h2>
        <p className="mt-3 text-brown-700">{OPENING_HOURS}</p>
        <p className="text-brown-600">{CLOSED_NOTE}</p>
      </section>
    </div>
  );
}
