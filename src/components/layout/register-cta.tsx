import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tombol utama menuju kuis pendaftaran. WhatsApp tetap tersedia lewat tombol melayang. */
export function RegisterCta({ className }: { className?: string }) {
  return (
    <Link
      href="/daftar"
      className={cn(
        "inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600",
        className,
      )}
    >
      Daftar Konsultasi
    </Link>
  );
}
