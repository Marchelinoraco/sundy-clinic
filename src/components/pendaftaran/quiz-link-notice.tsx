import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** Halaman /isi untuk link yang sudah dikirim atau tidak berlaku (spec C3 3.1). Pesannya sama untuk semua alasan. */
export function QuizLinkNotice({ state }: { state: "SUBMITTED" | "CLOSED" }) {
  if (state === "SUBMITTED") {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-brown-900">Terima kasih, sudah kami terima</h1>
        <p className="text-brown-700">Jawaban Anda hanya dibaca dokter kami. Sampai jumpa di klinik.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="font-display text-3xl text-brown-900">Link ini sudah tidak berlaku</h1>
      <p className="text-brown-700">Hubungi kami lewat WhatsApp bila Anda masih ingin mengisi form.</p>
      <Button asChild size="lg" className="h-12 w-full rounded-full text-base">
        <a
          href={buildWhatsAppLink("Halo SunDY Clinic, link form saya sudah tidak berlaku.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hubungi via WhatsApp
        </a>
      </Button>
    </div>
  );
}
