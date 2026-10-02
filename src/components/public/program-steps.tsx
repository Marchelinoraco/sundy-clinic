"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/motion/reveal";
import { STEP_IMAGES } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

export const PROGRAM_STEPS = [
  {
    title: "Konsultasi dokter",
    body: "Dokter mendengarkan tujuan dan kondisi kesehatan Anda, lalu menyusun rencana program yang sesuai.",
    image: STEP_IMAGES.konsultasi,
  },
  {
    title: "Timbang BIA & meal plan",
    body: "Timbang BIA mengukur komposisi tubuh Anda — massa lemak, massa otot, lemak visceral, dan kadar air — sebagai dasar menu makan Anda.",
    image: STEP_IMAGES.timbang,
  },
  {
    title: "Kontrol mingguan",
    body: "Perkembangan Anda dipantau dari minggu ke minggu, dan program disesuaikan agar hasilnya terjaga.",
    image: STEP_IMAGES.kontrol,
  },
];

type ProgramStepsProps = {
  headingId: string;
  title: string;
  /** Tautan ke /program-slimming (Beranda); tidak perlu di halaman Program Slimming sendiri. */
  showProgramLink?: boolean;
};

/**
 * Cara kerja Program Slimming. Desktop: foto menempel di kanan dan berganti
 * mengikuti langkah yang sedang melintasi tengah layar. Ponsel: kartu
 * berfoto yang menempel bertumpuk dan muncul satu per satu.
 */
export function ProgramSteps({ headingId, title, showProgramLink = false }: ProgramStepsProps) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const step of stepRefs.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-labelledby={headingId} className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Eyebrow>Cara kerja</Eyebrow>
        <h2 id={headingId} className="mt-2 font-display text-4xl text-brown-900">
          {title}
        </h2>

        <div className="mt-10 lg:grid lg:grid-cols-2 lg:gap-16">
          <ol className="space-y-5 lg:space-y-0">
            {PROGRAM_STEPS.map((step, index) => (
              <li
                key={step.title}
                ref={(node) => {
                  stepRefs.current[index] = node;
                }}
                data-active={index === active ? "true" : "false"}
                // Ponsel: kartu menempel bertumpuk dengan sedikit selisih. Desktop: statis, setinggi 70% layar.
                style={{ top: `calc(var(--header-h) + ${1 + index * 0.75}rem)` }}
                className="group sticky lg:static lg:flex lg:min-h-[70vh] lg:items-center"
              >
                <Reveal className="w-full">
                  <article className="overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-[0_18px_40px_-28px_rgb(107_85_53/0.6)] transition-opacity duration-500 motion-reduce:transition-none lg:border-0 lg:bg-transparent lg:shadow-none lg:group-data-[active=false]:opacity-40">
                    <div className="relative aspect-[16/10] bg-cream-200 lg:hidden">
                      <Image
                        src={step.image.src}
                        alt={step.image.alt}
                        fill
                        sizes="(min-width: 640px) 600px, 92vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-6 lg:p-0">
                      <p aria-hidden="true" className="font-display text-5xl text-gold-500">
                        {index + 1}
                      </p>
                      <h3 className="mt-1 font-display text-2xl text-brown-900">{step.title}</h3>
                      <p className="mt-2 leading-relaxed text-brown-700">{step.body}</p>
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-[calc(var(--header-h)+3rem)] aspect-[4/5] overflow-hidden rounded-b-[2rem]">
              <div className="absolute inset-0 overflow-hidden rounded-t-full bg-cream-200">
                {PROGRAM_STEPS.map((step, index) => (
                  <Image
                    key={step.title}
                    src={step.image.src}
                    alt={index === active ? step.image.alt : ""}
                    fill
                    sizes="(min-width: 1024px) 560px, 1px"
                    className={cn(
                      "object-cover transition-opacity duration-700 motion-reduce:transition-none",
                      index === active ? "opacity-100" : "opacity-0",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {showProgramLink && (
          <Link
            href="/program-slimming"
            className="mt-10 inline-block rounded-full border border-gold-500 px-7 py-3 font-medium text-gold-600 hover:bg-cream-100"
          >
            Lihat paket Program Slimming
          </Link>
        )}
      </div>
    </section>
  );
}
