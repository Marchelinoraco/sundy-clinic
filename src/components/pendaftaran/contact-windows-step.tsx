"use client";

import { SingleChoice } from "@/components/kuis/choice";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { ONLINE_MAX_DAYS_AHEAD, type WindowDraft } from "@/lib/online-consultation";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import type { OnlineOption } from "@/server/public-booking-data";

export type OnlineScheduleDraft = { staffId: string | null; windows: WindowDraft[] };

/** Langkah "Kapan Anda bisa dihubungi?" untuk konsultasi online (spec 4.2). */
export function ContactWindowsStep({
  online,
  value,
  onChange,
}: {
  online: OnlineOption;
  value: OnlineScheduleDraft;
  onChange: (patch: Partial<OnlineScheduleDraft>) => void;
}) {
  const today = witaDateString(new Date());
  return (
    <div className="space-y-5">
      {online.doctors.length > 1 ? (
        <SingleChoice
          label="Dokter"
          options={online.doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
          value={value.staffId ?? undefined}
          onChange={(staffId) => onChange({ staffId })}
        />
      ) : (
        <p className="text-sm text-brown-700">Dengan {online.doctors[0]?.name}</p>
      )}
      <ContactWindowsEditor
        value={value.windows}
        onChange={(windows) => onChange({ windows })}
        minDate={today}
        maxDate={addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD)}
      />
    </div>
  );
}
