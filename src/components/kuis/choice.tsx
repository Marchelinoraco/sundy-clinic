"use client";

import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = { value: T; label: string; hint?: string };

/** { KUNCI: "Label" } → daftar pilihan dengan urutan yang sama. */
export function optionsOf<T extends Record<string, string>>(
  labels: T,
  hints?: Partial<Record<keyof T, string>>,
): ChoiceOption<keyof T & string>[] {
  return (Object.keys(labels) as (keyof T & string)[]).map((value) => ({
    value,
    label: labels[value],
    hint: hints?.[value],
  }));
}

const cardClass = (selected: boolean) =>
  cn(
    "w-full rounded-2xl border bg-white px-4 py-4 text-left transition",
    selected ? "border-gold-500 bg-cream-100 font-semibold" : "border-cream-300 hover:border-gold-400",
  );

export function SingleChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cardClass(option.value === value)}
        >
          <span className="block text-base text-brown-900">{option.label}</span>
          {option.hint && <span className="mt-0.5 block text-sm font-normal text-brown-600">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function MultiChoice<T extends string>({
  label,
  options,
  values,
  onChange,
  exclusive,
}: {
  label: string;
  options: ChoiceOption<T>[];
  values: readonly T[] | undefined;
  onChange: (values: T[]) => void;
  /** Pilihan seperti "Tidak ada" yang meniadakan pilihan lain. */
  exclusive?: T;
}) {
  const current = values ?? [];

  function toggle(value: T) {
    if (current.includes(value)) return onChange(current.filter((v) => v !== value));
    if (value === exclusive) return onChange([value]);
    onChange([...current.filter((v) => v !== exclusive), value]);
  }

  return (
    <div role="group" aria-label={label} className="space-y-3">
      {options.map((option) => {
        const selected = current.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option.value)}
            className={cardClass(selected)}
          >
            <span aria-hidden className="mr-2">
              {selected ? "☑" : "☐"}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pilihan pendek berjajar, mis. Berhasil / Tidak berhasil / Masih jalan. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-lg border px-2 py-2 text-sm",
            option.value === value
              ? "border-gold-500 bg-gold-500 font-semibold text-white"
              : "border-cream-300 bg-white text-brown-800",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
