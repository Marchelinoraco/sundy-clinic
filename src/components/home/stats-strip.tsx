import type { ReactNode } from "react";
import { CountUp } from "@/components/motion/count-up";
import { CLINIC_FOUNDED_YEAR, CUSTOMER_COUNT, OPENING_DAYS, OPENING_TIME } from "@/lib/clinic";

type Stat = { key: string; value: ReactNode; label: string };

/** Angka sekilas di bawah hero. Hanya angka dari pemilik dan dari data; tanpa klaim lain. */
export function StatsStrip({ treatmentCount }: { treatmentCount: number }) {
  const stats: Stat[] = [
    { key: "customer", value: <CountUp value={CUSTOMER_COUNT} suffix="+" />, label: "customer" },
    { key: "berdiri", value: <span>{CLINIC_FOUNDED_YEAR}</span>, label: "tahun berdiri" },
    { key: "treatment", value: <CountUp value={treatmentCount} />, label: "pilihan treatment" },
    { key: "jam", value: <span>{OPENING_TIME}</span>, label: `${OPENING_DAYS} · WITA` },
  ];

  return (
    <section aria-label="Sekilas SunDY" className="relative z-10 mx-auto -mt-10 max-w-5xl px-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-cream-300 bg-cream-300 shadow-[0_24px_48px_-28px_rgb(107_85_53/0.5)] md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="flex flex-col-reverse bg-white px-4 py-6 text-center">
            <dt className="mt-1 text-sm text-brown-600">{stat.label}</dt>
            <dd className="font-display text-[1.75rem] font-semibold leading-none text-gold-600 sm:text-4xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
