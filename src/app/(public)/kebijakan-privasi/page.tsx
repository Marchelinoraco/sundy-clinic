import type { Metadata } from "next";
import { CLINIC_FULL_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { PRIVACY_POLICY_VERSION_LABEL } from "@/lib/privacy";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: `Kebijakan privasi ${CLINIC_FULL_NAME} sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.`,
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Kebijakan Privasi</h1>
      <p className="mt-2 text-sm text-brown-600">Versi {PRIVACY_POLICY_VERSION_LABEL}</p>

      <div className="mt-8 space-y-6 leading-relaxed text-brown-700">
        <p>
          {CLINIC_FULL_NAME} menghormati privasi Anda. Kebijakan ini menjelaskan data apa yang kami
          kumpulkan, untuk apa digunakan, dan hak Anda atas data tersebut, sesuai Undang-Undang
          Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </p>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Data yang kami kumpulkan</h2>
          <p className="mt-2">
            Kami menerima data pribadi Anda ketika Anda mendaftar lewat situs ini, menghubungi kami
            lewat WhatsApp, atau datang ke klinik: nama, nomor WhatsApp, tanggal lahir, jenis
            kelamin, pekerjaan, alamat, serta informasi kesehatan yang Anda isi di kuis pendaftaran
            atau sampaikan kepada dokter. Situs ini tidak mengumpulkan data pribadi secara otomatis.
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
          <h2 className="font-display text-2xl text-brown-900">Kuis pendaftaran</h2>
          <p className="mt-2">
            Jawaban kuis — keluhan, tujuan, riwayat penyakit dan obat, alergi, riwayat diet, pola
            makan, dan aktivitas harian — dikirim ke klinik hanya setelah Anda menekan tombol Kirim
            dan menyetujui kebijakan ini. Sebelum itu jawaban hanya tersimpan sementara di browser
            Anda dan terhapus saat tab ditutup. Jawaban dibaca dokter untuk mempersiapkan
            konsultasi dan menjadi bagian dari rekam medis Anda. Petugas pendaftaran hanya melihat
            data diri Anda, bukan jawaban kesehatan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-brown-900">Biaya booking</h2>
          <p className="mt-2">
            Jadwal dari situs, WhatsApp, atau telepon dikunci dengan biaya booking yang
            ditransfer ke rekening klinik. Biaya ini terpisah dari biaya layanan, tidak
            dikembalikan, dan tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelum
            jadwal. Booking dari situs yang belum dikonfirmasi dalam 24 jam (hari Minggu dan
            hari libur tidak dihitung) dibatalkan otomatis.
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
