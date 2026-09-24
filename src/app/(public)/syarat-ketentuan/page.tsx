import type { Metadata } from "next";
import { CLINIC_FULL_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description: `Syarat dan ketentuan layanan ${CLINIC_FULL_NAME}.`,
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Syarat & Ketentuan</h1>

      <div className="mt-8 space-y-6 leading-relaxed text-brown-700">
        <section>
          <h2 className="font-display text-2xl text-brown-900">Informasi di situs ini</h2>
          <p className="mt-2">
            Keterangan mengenai treatment di situs ini bersifat informasi umum dan bukan pengganti
            konsultasi medis. Tindakan yang sesuai untuk Anda ditentukan dokter setelah pemeriksaan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Harga</h2>
          <p className="mt-2">
            Harga yang tercantum adalah harga promo yang berlaku saat halaman ini ditampilkan dan
            dapat berubah sewaktu-waktu. Jumlah sesi, dosis, dan harga akhir untuk sebagian
            treatment ditentukan setelah konsultasi.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Hasil perawatan</h2>
          <p className="mt-2">
            Hasil setiap treatment berbeda pada tiap orang, bergantung pada kondisi tubuh, kepatuhan
            menjalani program, dan faktor lain. Kami tidak menjanjikan hasil yang seragam.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Janji temu</h2>
          <p className="mt-2">
            Janji temu dibuat melalui WhatsApp {CLINIC_WHATSAPP_DISPLAY}. Mohon memberi tahu kami
            sesegera mungkin bila Anda berhalangan hadir agar jadwal dapat diberikan kepada pasien
            lain.
          </p>
        </section>
      </div>
    </div>
  );
}
