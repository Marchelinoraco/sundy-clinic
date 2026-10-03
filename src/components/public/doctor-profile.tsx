import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { ArchImage } from "./arch-image";
import { Eyebrow } from "./eyebrow";
import { MorphBlob } from "./morph-blob";

/** "Dr. Diane Paparang, Sp.GK, AIFO-K" → "dr. Diane": sapaan pendek untuk tombol. */
export function doctorCallName(name: string): string {
  const [fullName = ""] = name.split(",");
  const withoutTitle = fullName.replace(/^dr\.\s*|^dr\s+/i, "").trim();
  const [firstName = withoutTitle] = withoutTitle.split(/\s+/);
  return `dr. ${firstName}`;
}

type DoctorProfileProps = {
  person: { name: string; specialty: string | null; bio: string | null; role: string };
  photo: SiteImage | null;
  /** 2 di Beranda (bagian sendiri), 3 di Tentang (di bawah "Tim Dokter"). */
  headingLevel?: 2 | 3;
  eyebrow?: string;
};

/**
 * Profil dokter: foto dalam bingkai lengkung dengan bentuk emas, teks yang
 * masuk dari samping, dan ajakan konsultasi. Induknya perlu overflow-hidden
 * karena bentuk emas melebar keluar foto.
 */
export function DoctorProfile({ person, photo, headingLevel = 2, eyebrow }: DoctorProfileProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className={cn("grid items-center gap-10", photo && "md:grid-cols-[minmax(0,22rem)_1fr]")}>
      {photo && (
        <Reveal className="relative mx-auto w-full max-w-[20rem]">
          <MorphBlob className="-inset-10" />
          <ArchImage image={photo} sizes="(min-width: 768px) 352px, 80vw" className="aspect-[4/5] w-full" />
        </Reveal>
      )}

      <Reveal from="right">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl">{person.name}</Heading>
        {person.specialty && <p className="mt-2 font-medium text-gold-600">{person.specialty}</p>}
        {person.bio && <p className="mt-4 max-w-xl leading-relaxed text-brown-700">{person.bio}</p>}
        {person.role === "DOKTER" && (
          <Link
            href="/daftar"
            className="mt-8 inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
          >
            Konsultasi dengan {doctorCallName(person.name)}
          </Link>
        )}
      </Reveal>
    </article>
  );
}
