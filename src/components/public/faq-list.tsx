"use client";

import { Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type Faq = { question: string; answer: string };

function normalize(text: string): string {
  return text.toLocaleLowerCase("id-ID").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Pertanyaan yang memuat semua kata yang diketik, di pertanyaan atau jawabannya. */
export function filterFaqs(faqs: readonly Faq[], query: string): Faq[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...faqs];
  return faqs.filter((faq) => {
    const haystack = normalize(`${faq.question} ${faq.answer}`);
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Akordeon tanya jawab dengan kotak cari. Jawaban yang tertutup tetap ada di
 * HTML (dilipat dengan grid-rows dan `inert`), jadi tetap terbaca mesin
 * pencari. Tinggi akordeon adalah satu-satunya animasi tinggi yang diizinkan spec.
 */
export function FaqList({ faqs }: { faqs: readonly Faq[] }) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const visible = filterFaqs(faqs, query);

  function toggle(question: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  }

  return (
    <div>
      <label htmlFor={`${baseId}-cari`} className="sr-only">
        Cari pertanyaan
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-brown-600"
        />
        <input
          id={`${baseId}-cari`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari pertanyaan, misalnya BIA"
          autoComplete="off"
          className="w-full rounded-full border border-cream-300 bg-white py-3 pl-12 pr-5 text-brown-900 placeholder:text-brown-600/70 focus-visible:outline-2 focus-visible:outline-gold-500"
        />
      </div>

      {visible.length === 0 ? (
        <p role="status" className="mt-8 rounded-3xl border border-cream-300 bg-cream-100 p-6 text-center text-brown-700">
          Tidak ada pertanyaan yang cocok.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-cream-300 overflow-hidden rounded-3xl border border-cream-300 bg-white">
          {visible.map((faq) => {
            const index = faqs.indexOf(faq);
            const expanded = open.has(faq.question);
            const buttonId = `${baseId}-tanya-${index}`;
            const panelId = `${baseId}-jawab-${index}`;

            return (
              <li key={faq.question}>
                <h2 className="font-display text-xl text-brown-900">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggle(faq.question)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left hover:bg-cream-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-500"
                  >
                    <span>{faq.question}</span>
                    <Plus
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0 text-gold-600 transition-transform duration-300 motion-reduce:transition-none",
                        expanded && "rotate-45",
                      )}
                    />
                  </button>
                </h2>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  inert={!expanded}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 leading-relaxed text-brown-700">{faq.answer}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
