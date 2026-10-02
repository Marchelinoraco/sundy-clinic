import { cn } from "@/lib/utils";

type MorphBlobProps = {
  /** Posisi dan ukuran, misalnya "-right-24 -top-24 h-80 w-80". */
  className?: string;
  tone?: "gold" | "cream";
};

/**
 * Bentuk emas cair: tiga gumpalan bergradasi yang bergeser dan berputar dengan
 * tempo berbeda (CSS di globals.css). Hiasan saja, jadi disembunyikan dari
 * pembaca layar dan tidak menangkap klik. Induknya perlu `relative` dan
 * `overflow-hidden` supaya bentuknya tidak membuat halaman menggulir ke samping.
 */
export function MorphBlob({ className, tone = "gold" }: MorphBlobProps) {
  return (
    <div aria-hidden="true" data-tone={tone} className={cn("morph-blob pointer-events-none absolute", className)}>
      <span className="morph-blob__part blob-a" />
      <span className="morph-blob__part blob-b" />
      <span className="morph-blob__part blob-c" />
    </div>
  );
}
