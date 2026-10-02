import Image from "next/image";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";

type ArchImageProps = {
  image: SiteImage;
  sizes: string;
  /** Untuk foto di kepala halaman: dimuat paling dulu. */
  priority?: boolean;
  /** Foto naik dari dalam bingkai saat halaman dibuka (untuk hero). Foto di bawah layar dibungkus Reveal. */
  rise?: boolean;
  /** Lebar dan rasio, misalnya "aspect-[4/5] w-full". */
  className?: string;
};

/**
 * Foto dalam bingkai lengkung: atas setengah lingkaran, bawah membulat.
 * Dua lapis pemotong karena satu border-radius tidak bisa membuat keduanya:
 * radius atas yang sangat besar ikut mengecilkan radius bawah.
 */
export function ArchImage({ image, sizes, priority = false, rise = false, className }: ArchImageProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-b-[2rem]", className)}>
      <div className="absolute inset-0 overflow-hidden rounded-t-full bg-cream-200">
        <div className={cn("absolute inset-0", rise && "arch-rise")}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes={sizes}
            priority={priority}
            className="zoom-slow object-cover"
          />
        </div>
      </div>
    </div>
  );
}
