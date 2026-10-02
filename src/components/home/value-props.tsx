import { HeartHandshake, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { Eyebrow } from "@/components/public/eyebrow";
import { CLINIC_BEAUTY_TAGLINE } from "@/lib/clinic";

/** Empat nilai jual dari materi promosi klinik. */
const VALUE_PROPS = [
  { title: "Professional Treatment", body: "Ditangani dokter dan terapis berpengalaman.", icon: Stethoscope },
  { title: "Premium Technology", body: "Peralatan modern untuk hasil yang optimal.", icon: Sparkles },
  { title: "Safe & Hygienic", body: "Prosedur dan alat yang steril serta terkontrol.", icon: ShieldCheck },
  { title: "Beauty For You", body: "Perawatan yang disesuaikan dengan kondisi Anda.", icon: HeartHandshake },
];

export function ValueProps() {
  return (
    <section aria-labelledby="keunggulan" className="mx-auto max-w-6xl px-4 py-20">
      <Eyebrow>Kenapa SunDY</Eyebrow>
      <h2 id="keunggulan" className="mt-2 font-display text-4xl text-brown-900">
        {CLINIC_BEAUTY_TAGLINE}
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map((prop, index) => (
          <Reveal key={prop.title} delay={staggerDelay(index)} className="h-full">
            <div className="h-full rounded-3xl border border-cream-300 bg-white p-6 transition-transform duration-300 hover:-translate-y-1.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-cream-100 text-gold-600">
                <prop.icon aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-4 font-display text-xl text-brown-900">{prop.title}</h3>
              <p className="mt-2 text-sm text-brown-600">{prop.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
