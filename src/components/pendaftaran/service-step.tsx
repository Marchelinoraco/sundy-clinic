"use client";

import { SingleChoice } from "@/components/kuis/choice";
import { formatRupiah } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";
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
}: {
  options: BookingOptions;
  answers: QuizAnswers;
  service: PublicService;
  onSelect: (serviceId: string) => void;
}) {
  const services = servicesFor(options, answers);

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
    </div>
  );
}
