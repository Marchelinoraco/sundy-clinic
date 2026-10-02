import type { Metadata } from "next";
import { FaqList } from "@/components/public/faq-list";
import { PageHero } from "@/components/public/page-hero";
import { CLINIC_WHATSAPP_DISPLAY, CLOSED_NOTE, OPENING_HOURS } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Tanya Jawab",
  description: "Pertanyaan yang sering diajukan tentang layanan dan program di SunDY Clinic Manado.",
};

// Isi FAQ masih ditulis di sini. Pengelolaan lewat panel admin dibangun pada Plan 2.
const faqs = [
  {
    question: "Bagaimana cara mendaftar konsultasi?",
    answer: `Untuk saat ini pendaftaran dilakukan lewat WhatsApp di ${CLINIC_WHATSAPP_DISPLAY}. Pendaftaran mandiri lewat situs dengan pilihan jadwal akan segera tersedia.`,
  },
  {
    question: "Apa itu Timbang BIA?",
    answer:
      "BIA (Bioelectrical Impedance Analysis) mengukur komposisi tubuh Anda: berat badan, massa lemak, massa otot, lemak visceral, dan kadar air. Angka-angka inilah yang dipakai dokter untuk menyusun dan mengevaluasi program Anda.",
  },
  {
    question: "Apakah harus konsultasi dulu sebelum treatment?",
    answer:
      "Ya. Konsultasi dokter diperlukan agar treatment yang dipilih sesuai dengan kondisi kulit dan kesehatan Anda, serta aman untuk dijalani.",
  },
  {
    question: "Berapa jam operasional klinik?",
    answer: `${OPENING_HOURS}. ${CLOSED_NOTE}.`,
  },
  {
    question: "Apakah harga yang tercantum sudah final?",
    answer:
      "Harga yang tercantum adalah harga promo yang sedang berjalan dan dapat berubah. Untuk treatment tertentu, jumlah sesi dan dosis ditentukan setelah konsultasi.",
  },
  {
    question: "Kapan cabang Citraland buka?",
    answer:
      "Cabang SunDY Citraland di Cluster The Manhattan sedang dipersiapkan. Hubungi kami lewat WhatsApp agar kami kabari saat sudah buka.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero
        title="Tanya Jawab"
        description={
          <p>
            Pertanyaan yang sering diajukan tentang layanan dan program SunDY Clinic. Belum menemukan
            jawabannya? Tanyakan lewat WhatsApp di {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-14">
        <FaqList faqs={faqs} />
      </div>
    </>
  );
}
