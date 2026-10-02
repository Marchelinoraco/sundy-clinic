"use client";

import { motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PackageCard } from "@/components/catalog/package-card";
import { usePrefersReducedMotion } from "@/components/motion/use-motion-prefs";
import { cn } from "@/lib/utils";

export type PackageTabGroup = {
  groupName: string;
  tagline: string;
  packages: { id: string; slug: string; name: string; monthlyPrice: number; items: { id: string; label: string }[] }[];
};

type PackageTabsProps = {
  groups: PackageTabGroup[];
  /** Kelompok dari ?paket=. Bila kelompok itu sedang tanpa paket, kelompok pertama yang dibuka. */
  initialGroup: string;
};

/**
 * Tombol pilihan paket (pola ARIA tablist, aktivasi otomatis).
 *
 * Semua panel dirender di server dan yang tidak aktif disembunyikan dengan
 * `hidden`, jadi semua paket tetap terbaca mesin pencari. Penanda pilihan
 * meluncur ke tombol aktif (layoutId motion), dan pilihan disimpan di
 * ?paket= dengan replaceState supaya tautannya bisa dibagikan tanpa
 * menambah riwayat Kembali.
 */
export function PackageTabs({ groups, initialGroup }: PackageTabsProps) {
  const fallback = groups[0]?.groupName ?? "";
  const [active, setActive] = useState(
    groups.some((group) => group.groupName === initialGroup) ? initialGroup : fallback,
  );
  const reduce = usePrefersReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function select(index: number, focus: boolean) {
    const group = groups[index];
    if (!group) return;
    setActive(group.groupName);
    const url = new URL(window.location.href);
    url.searchParams.set("paket", group.groupName.toLowerCase());
    window.history.replaceState(null, "", url);
    if (focus) tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = groups.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Kelompok paket"
        className="inline-flex rounded-full border border-cream-300 bg-white p-1 shadow-sm"
      >
        {groups.map((group, index) => {
          const selected = group.groupName === active;
          return (
            <button
              key={group.groupName}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group.groupName}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${group.groupName}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index, false)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative rounded-full px-6 py-2 text-sm font-semibold tracking-wide",
                selected ? "text-gold-300" : "text-brown-700 hover:text-brown-900",
              )}
            >
              {selected &&
                (reduce ? (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full bg-brown-900" />
                ) : (
                  <motion.span
                    layoutId={`${baseId}-penanda`}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-brown-900"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ))}
              <span className="relative">{group.groupName}</span>
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section
          key={group.groupName}
          role="tabpanel"
          id={`${baseId}-panel-${group.groupName}`}
          aria-labelledby={`${baseId}-tab-${group.groupName}`}
          hidden={group.groupName !== active}
          tabIndex={0}
          className="panel-in mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-500"
        >
          <h2 className="font-display text-3xl text-brown-900">Paket {group.groupName}</h2>
          <p className="mt-1 text-sm italic text-brown-600">{group.tagline}</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.packages.map((item) => (
              <PackageCard key={item.id} pkg={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
