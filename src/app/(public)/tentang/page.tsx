import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { DoctorProfile } from "@/components/public/doctor-profile";
import { PageHero } from "@/components/public/page-hero";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FOUNDED_YEAR,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  CUSTOMER_COUNT,
  OPENING_HOURS,
} from "@/lib/clinic";
import { CLINIC_GALLERY, doctorPhotos } from "@/lib/site-images";
import { getPublicStaff } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Tentang Kami",
  description:
    "SunDY — Nutrition, Slimming & Wellness Clinic Manado. Program penurunan berat badan dan perawatan estetika yang ditangani dokter.",
};

export default async function AboutPage() {
  const team = await getPublicStaff();
  const leadDoctor = team.find((person) => person.role === "DOKTER");
  const heroPhoto = leadDoctor ? doctorPhotos(leadDoctor)?.portrait : null;

  return (
    <>
      <PageHero
        title="Tentang SunDY"
        image={heroPhoto ?? CLINIC_GALLERY[0]}
        description={
          <p>
            Nutrition, Slimming &amp; Wellness Clinic · Manado · sejak {CLINIC_FOUNDED_YEAR}
          </p>
        }
      />

      <section aria-labelledby="cerita-kami" className="mx-auto max-w-3xl px-4 py-16">
        <h2 id="cerita-kami" className="font-display text-3xl text-brown-900">
          Cerita kami
        </h2>
        <Reveal>
          <p className="mt-6 leading-relaxed text-brown-700">
            SunDY Clinic adalah klinik nutrisi, slimming, dan wellness di Manado. Kami memadukan
            program penurunan berat badan yang diawasi dokter dengan perawatan estetika, sehingga
            perubahan yang Anda capai terlihat sekaligus terasa. {CLINIC_TAGLINE}. {CLINIC_BEAUTY_TAGLINE}.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-4 leading-relaxed text-brown-700">
            Setiap program dimulai dari konsultasi dan Timbang BIA untuk mengetahui komposisi tubuh Anda
            — bukan sekadar angka di timbangan — agar rencana yang disusun benar-benar sesuai kondisi
            Anda.
          </p>
        </Reveal>
        <ul aria-label="Sekilas SunDY" className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-brown-800">
          <li className="rounded-full border border-gold-300 bg-cream-100 px-4 py-2">{CUSTOMER_COUNT}+ customer</li>
          <li className="rounded-full border border-gold-300 bg-cream-100 px-4 py-2">Sejak {CLINIC_FOUNDED_YEAR}</li>
        </ul>
      </section>

      {team.length > 0 && (
        <section aria-labelledby="tim-dokter" className="overflow-hidden bg-cream-100 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="tim-dokter" className="font-display text-3xl text-brown-900">
              Tim Dokter
            </h2>
            <div className="mt-10 grid gap-16">
              {team.map((person) => (
                // Foto 2 di sini, karena foto 1 sudah di kepala halaman.
                <DoctorProfile key={person.id} person={person} photo={doctorPhotos(person)?.feature ?? null} headingLevel={3} />
              ))}
            </div>
          </div>
        </section>
      )}

      <ClinicGallery headingId="suasana-tentang" />

      <section aria-labelledby="jam-praktik" className="mx-auto max-w-3xl px-4 py-16">
        <h2 id="jam-praktik" className="font-display text-3xl text-brown-900">
          Jam Praktik
        </h2>
        <p className="mt-3 text-brown-700">{OPENING_HOURS}</p>
        <p className="text-brown-600">{CLOSED_NOTE}</p>
      </section>
    </>
  );
}
