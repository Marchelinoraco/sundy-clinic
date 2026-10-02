import type { Metadata } from "next";
import { QuizLinkEntry } from "@/components/pendaftaran/quiz-link-entry";

export const metadata: Metadata = {
  title: "Isi Form Sebelum Konsultasi",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec C3 3.1). */
export default function QuizLinkPage() {
  return <QuizLinkEntry />;
}
