"use client";

import { useLenis } from "lenis/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePrefersReducedMotion } from "@/components/motion/use-motion-prefs";
import { categoryAnchorId } from "@/lib/category-anchor";

type CategoryNavProps = { categories: { slug: string; name: string }[] };

/**
 * Chip kategori yang menempel di bawah header. Chip menyala mengikuti
 * kategori yang sedang terlihat, dan klik chip menggulir halus ke
 * kategorinya (langsung melompat untuk "kurangi gerakan"). Tanpa
 * JavaScript, chip tetap berupa jangkar #bagian-… biasa.
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const [active, setActive] = useState<string | null>(categories[0]?.slug ?? null);
  const reduce = usePrefersReducedMotion();
  const lenis = useLenis();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slug = entry.target.getAttribute("data-category");
          if (entry.isIntersecting && slug) setActive(slug);
        }
      },
      // Bagian dianggap terlihat saat melintasi pita sepertiga atas layar, tepat di bawah chip.
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const category of categories) {
      const section = document.getElementById(categoryAnchorId(category.slug));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  // Chip aktif digeser masuk ke baris chip (di ponsel baris ini bisa digeser menyamping), hanya
  // bila terpotong. Posisi dihitung relatif terhadap baris: baris berada di tengah (mx-auto),
  // jadi offsetLeft chip ikut menghitung marginnya dan akan memotong chip pertama.
  useEffect(() => {
    const row = rowRef.current;
    const chip = active ? row?.querySelector<HTMLElement>(`[data-chip="${active}"]`) : null;
    if (!row || !chip) return;
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    if (chipBox.left >= rowBox.left && chipBox.right <= rowBox.right) return;
    row.scrollTo({ left: row.scrollLeft + chipBox.left - rowBox.left - 16, behavior: reduce ? "auto" : "smooth" });
  }, [active, reduce]);

  function goTo(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    const target = document.getElementById(categoryAnchorId(slug));
    if (!target) return;
    event.preventDefault();
    setActive(slug);
    // Jarak di bawah header dan baris chip datang dari scroll-margin-top bagian (scroll-mt di
    // /layanan). Lenis dan scrollIntoView sama-sama memperhitungkannya, jadi tanpa offset tambahan.
    if (lenis) lenis.scrollTo(target, { immediate: reduce });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${categoryAnchorId(slug)}`);
  }

  return (
    <nav
      aria-label="Kategori layanan"
      className="sticky top-[var(--header-h)] z-30 border-b border-cream-300 bg-cream-50/90 backdrop-blur"
    >
      <div ref={rowRef} data-chip-row="" className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {categories.map((category) => (
          <a
            key={category.slug}
            href={`#${categoryAnchorId(category.slug)}`}
            data-chip={category.slug}
            aria-current={active === category.slug ? "true" : undefined}
            onClick={(event) => goTo(event, category.slug)}
            className="shrink-0 whitespace-nowrap rounded-full border border-cream-300 bg-white px-4 py-1.5 text-sm text-brown-700 hover:border-gold-400 aria-[current=true]:border-brown-900 aria-[current=true]:bg-brown-900 aria-[current=true]:text-gold-300"
          >
            {category.name}
          </a>
        ))}
      </div>
    </nav>
  );
}
