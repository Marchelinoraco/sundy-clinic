import { CLINIC_FULL_NAME } from "@/lib/clinic";

type LogoProps = {
  /** Tinggi logo dalam kelas Tailwind, misal "h-11 md:h-14". */
  className?: string;
  /** Menampilkan baris tagline di bawah wordmark. Dipakai di footer. */
  withTagline?: boolean;
};

/**
 * Wordmark SunDY.
 *
 * Saat ini digambar dengan tipografi karena berkas logo resmi belum tersedia.
 * Begitu `public/logo-sundy.png` (latar transparan) ada, ganti isi komponen ini
 * dengan <Image src="/logo-sundy.png" alt={CLINIC_FULL_NAME} ... /> — header dan
 * footer memanggil komponen ini, jadi tidak ada berkas lain yang perlu disentuh.
 */
export function Logo({ className = "h-11 md:h-14", withTagline = false }: LogoProps) {
  return (
    <span className={`flex flex-col justify-center leading-none ${className}`}>
      <span className="font-display text-[1.75em] font-semibold tracking-tight">
        <span className="text-gold-500">Sun</span>
        <span className="text-brown-700">DY</span>
      </span>
      <span className="mt-[0.15em] text-[0.55em] font-medium tracking-tight text-brown-700">
        Nutrition, Slimming &amp; Wellness Clinic
      </span>
      {withTagline && (
        <span className="mt-[0.1em] font-display text-[0.55em] text-gold-600">
          Happy weight, happy life
        </span>
      )}
      <span className="sr-only">{CLINIC_FULL_NAME}</span>
    </span>
  );
}
