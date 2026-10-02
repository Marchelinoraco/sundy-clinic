"use client";

import { Input } from "@/components/ui/input";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

/** Masukan harga: diketik sebagai angka, tampil "Rp 189.000"; yang diteruskan tetap angka bulat (spec D 5.4). */
export function RupiahInput({
  id,
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      value={rupiahInputText(value)}
      onChange={(e) => onChange(parseRupiahText(e.target.value))}
    />
  );
}
