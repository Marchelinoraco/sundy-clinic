"use client";

import { SingleChoice } from "@/components/kuis/choice";
import { formatRupiah } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import { ONLINE_FEE_TERMS, onlineTotal } from "@/lib/online-consultation";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import type { BookingOptions, PublicService } from "@/server/public-booking-data";

/** Hanya pasien Aesthetic lama yang boleh memilih treatment (K9). */
export function servicesFor(options: BookingOptions, answers: QuizAnswers): PublicService[] {
  const mayChooseTreatment = answers.patientType === "LAMA" && answers.purpose === "AESTHETIC";
  return mayChooseTreatment ? [options.consultation, ...options.treatments] : [options.consultation];
}

export function ServiceStep({
  options,
  answers,
  service,
  onSelect,
  mode,
  onModeChange,
}: {
  options: BookingOptions;
  answers: QuizAnswers;
  service: PublicService;
  onSelect: (serviceId: string) => void;
  /** Cara konsultasi yang dipilih (spec 4.1); hanya berarti untuk konsultasi. */
  mode: "KLINIK" | "ONLINE";
  onModeChange: (mode: "KLINIK" | "ONLINE") => void;
}) {
  const services = servicesFor(options, answers);
  const canGoOnline = options.online !== null && service.id === options.consultation.id;
  const online = canGoOnline && mode === "ONLINE" ? options.online : null;

  return (
    <div className="space-y-4">
      {services.length > 1 ? (
        <SingleChoice
          label="Layanan"
          options={services.map((s) => ({
            value: s.id,
            label: s.name,
            hint: `${s.durationMin} menit · ${formatRupiah(s.price)}`,
          }))}
          value={service.id}
          onChange={onSelect}
        />
      ) : (
        <div className="rounded-2xl border border-gold-500 bg-cream-100 p-4">
          <p className="font-semibold text-brown-900">{service.name}</p>
          <p className="mt-1 text-sm text-brown-600">
            {service.durationMin} menit bersama dokter. Treatment ditentukan dokter setelah pemeriksaan.
          </p>
        </div>
      )}

      {canGoOnline && (
        <SingleChoice
          label="Cara konsultasi"
          options={[
            { value: "KLINIK", label: "Datang ke klinik", hint: "Bertemu dokter di klinik. Biaya konsultasi dibayar di klinik." },
            {
              value: "ONLINE",
              label: "Online lewat WhatsApp (telepon/video)",
              hint: "Dokter menelepon atau video call di waktu yang Anda pilih. Dibayar di muka.",
            },
          ]}
          value={mode}
          onChange={onModeChange}
        />
      )}

      {online ? (
        <>
          <dl className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">{online.serviceName}</dt>
              <dd className="text-right">{formatRupiah(online.price)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">Biaya booking</dt>
              <dd className="text-right">{formatRupiah(options.bookingFee)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-cream-300 pt-3 font-semibold">
              <dt className="text-brown-900">Total transfer di muka</dt>
              <dd className="text-right">
                {formatRupiah(onlineTotal({ bookingFee: options.bookingFee, servicePrice: online.price }))}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-brown-600">{ONLINE_FEE_TERMS}</p>
        </>
      ) : (
        <>
          <dl className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">{service.name}</dt>
              <dd className="text-right">
                {formatRupiah(service.price)}
                <span className="block text-brown-600">dibayar di klinik</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-brown-900">Biaya booking</dt>
              <dd className="text-right">
                {formatRupiah(options.bookingFee)}
                <span className="block text-brown-600">ditransfer setelah mendaftar</span>
              </dd>
            </div>
          </dl>
          <p className="text-sm text-brown-600">{BOOKING_FEE_TERMS}</p>
        </>
      )}
    </div>
  );
}
