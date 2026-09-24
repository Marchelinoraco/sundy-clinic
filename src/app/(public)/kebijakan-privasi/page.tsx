import type { Metadata } from "next";
import { CLINIC_FULL_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: `Kebijakan privasi ${CLINIC_FULL_NAME} sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.`,
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Kebijakan Privasi</h1>

      <div className="mt-8 space-y-6 leading-relaxed text-brown-700">
        <p>
          {CLINIC_FULL_NAME} menghormati privasi Anda. Kebijakan ini menjelaskan data apa yang kami
          kumpulkan, untuk apa digunakan, dan hak Anda atas data tersebut, sesuai Undang-Undang
          Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </p>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Data yang kami kumpulkan</h2>
          <p className="mt-2">
            Situs ini menampilkan informasi layanan dan tidak mengumpulkan data pribadi secara
            otomatis. Data pribadi Anda kami terima hanya ketika Anda menghubungi kami lewat
            WhatsApp atau datang ke klinik, berupa nama, nomor kontak, usia, jenis kelamin, dan
            informasi kesehatan yang Anda sampaikan kepada dokter.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Data kesehatan</h2>
          <p className="mt-2">
            Informasi kesehatan tergolong data pribadi bersifat spesifik. Data ini hanya diakses
            oleh dokter dan tenaga klinik yang berwenang, digunakan semata-mata untuk pelayanan
            kesehatan Anda, dan disimpan sesuai ketentuan Peraturan Menteri Kesehatan Nomor 24 Tahun
            2022 tentang Rekam Medis.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Penggunaan data</h2>
          <p className="mt-2">
            Data Anda digunakan untuk menjadwalkan kunjungan, memberikan pelayanan medis, dan
            menghubungi Anda terkait perawatan. Kami tidak menjual data Anda dan tidak
            membagikannya kepada pihak ketiga untuk kepentingan pemasaran.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Hak Anda</h2>
          <p className="mt-2">
            Anda berhak mengetahui data apa yang kami simpan tentang Anda, meminta koreksi bila ada
            yang keliru, dan menarik persetujuan atas pemrosesan data non-medis. Rekam medis sendiri
            wajib kami simpan selama jangka waktu yang ditetapkan peraturan dan tidak dapat dihapus
            atas permintaan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Menghubungi kami</h2>
          <p className="mt-2">
            Pertanyaan mengenai kebijakan ini dapat disampaikan lewat WhatsApp{" "}
            {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        </section>
      </div>
    </div>
  );
}
