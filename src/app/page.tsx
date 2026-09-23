import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { ServiceCard } from "@/components/catalog/service-card";
import {
  CLINIC_BEAUTY_TAGLINE,
  CLINIC_FULL_NAME,
  CLINIC_TAGLINE,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";
import { getBranches, getSignatureServices } from "@/server/catalog";

/** Empat nilai jual dari materi promosi klinik. */
const VALUE_PROPS = [
  { title: "Professional Treatment", body: "Ditangani dokter dan terapis berpengalaman." },
  { title: "Premium Technology", body: "Peralatan modern untuk hasil yang optimal." },
  { title: "Safe & Hygienic", body: "Prosedur dan alat yang steril serta terkontrol." },
  { title: "Beauty For You", body: "Perawatan yang disesuaikan dengan kondisi Anda." },
];

export default async function HomePage() {
  const [signatureServices, branches] = await Promise.all([
    getSignatureServices(),
    getBranches(),
  ]);

  return (
    <>
      <section className="bg-gradient-to-b from-cream-100 to-cream-50 px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-5xl text-brown-900">{CLINIC_FULL_NAME}</h1>
          <p className="mt-4 text-lg text-brown-700">{CLINIC_TAGLINE}</p>
          <p className="mt-1 text-lg text-brown-700">{CLINIC_BEAUTY_TAGLINE}</p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/layanan"
              className="rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
            >
              Lihat Layanan & Harga
            </Link>
            <Link
              href="/program-slimming"
              className="rounded-full border border-gold-500 px-7 py-3 font-medium text-gold-600 hover:bg-cream-100"
            >
              Program Slimming
            </Link>
          </div>

          <p className="mt-8 text-sm text-brown-600">
            {OPENING_HOURS} · {CLOSED_NOTE}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="keunggulan">
        <h2 id="keunggulan" className="sr-only">
          Keunggulan klinik
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="rounded-2xl border border-cream-300 bg-white p-6">
              <h3 className="font-display text-xl text-brown-900">{prop.title}</h3>
              <p className="mt-2 text-sm text-brown-600">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="signature">
        <h2 id="signature" className="font-display text-3xl text-brown-900">
          Our Signature Treatment
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {signatureServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
        <Link
          href="/layanan"
          className="mt-6 inline-block text-sm text-gold-600 underline-offset-4 hover:underline"
        >
          Lihat seluruh layanan
        </Link>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20" aria-labelledby="lokasi">
        <h2 id="lokasi" className="font-display text-3xl text-brown-900">
          Lokasi Kami
        </h2>
        <div className="mt-6 grid gap-6">
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} />
          ))}
        </div>
      </section>
    </>
  );
}
