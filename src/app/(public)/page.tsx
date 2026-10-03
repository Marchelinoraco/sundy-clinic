import { BranchCard } from "@/components/catalog/branch-card";
import { HomeHero } from "@/components/home/home-hero";
import { SignatureTreatments } from "@/components/home/signature-treatments";
import { StatsStrip } from "@/components/home/stats-strip";
import { ValueProps } from "@/components/home/value-props";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { DoctorProfile } from "@/components/public/doctor-profile";
import { FinalCta } from "@/components/public/final-cta";
import { ProgramSteps } from "@/components/public/program-steps";
import { doctorPhotos } from "@/lib/site-images";
import {
  countActiveServices,
  getBranches,
  getPublicStaff,
  getSignatureServices,
} from "@/server/catalog";

export default async function HomePage() {
  const [signatureServices, branches, team, treatmentCount] = await Promise.all([
    getSignatureServices(),
    getBranches(),
    getPublicStaff(),
    countActiveServices(),
  ]);

  // Saat ini hanya dr. Diane. Bila tidak ada dokter yang tampil di situs, bagian dokter dilewati.
  const doctor = team.find((person) => person.role === "DOKTER") ?? null;
  const photos = doctor ? doctorPhotos(doctor) : null;

  return (
    <>
      <HomeHero doctor={doctor} photo={photos?.portrait ?? null} />
      <StatsStrip treatmentCount={treatmentCount} />
      <ValueProps />
      <ProgramSteps headingId="cara-kerja" title="Program Slimming dalam tiga langkah" showProgramLink />
      <SignatureTreatments services={signatureServices} />

      {doctor && (
        <section className="overflow-hidden bg-cream-100">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <DoctorProfile person={doctor} photo={photos?.feature ?? null} eyebrow="Kenali dokter Anda" />
          </div>
        </section>
      )}

      <ClinicGallery headingId="suasana" />

      <section aria-labelledby="lokasi" className="mx-auto max-w-5xl px-4 py-20">
        <h2 id="lokasi" className="font-display text-4xl text-brown-900">
          Lokasi Kami
        </h2>
        <div className="mt-8 grid gap-6">
          {branches.map((branch, index) => (
            <Reveal key={branch.id} delay={staggerDelay(index)}>
              <BranchCard branch={branch} headingLevel={3} />
            </Reveal>
          ))}
        </div>
      </section>

      <FinalCta />
    </>
  );
}
