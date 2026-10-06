"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Segmented } from "@/components/kuis/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateIdentity } from "@/lib/kuis/identity";
import { ONLINE_FEE_TERMS } from "@/lib/online-consultation";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import { witaDateString } from "@/lib/time";

export type IdentityDraft = {
  name: string;
  whatsapp: string;
  birthDate: string;
  gender: "" | "L" | "P";
  occupation: string;
  address: string;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan untuk bot (spec bagian 8). */
  website: string;
};

export const EMPTY_IDENTITY: IdentityDraft = {
  name: "",
  whatsapp: "",
  birthDate: "",
  gender: "",
  occupation: "",
  address: "",
  consentData: false,
  consentFee: false,
  website: "",
};

/** Pasien lama cukup nama, WA, dan tanggal lahir — hanya untuk dicocokkan admin. */
export function identityPayload(draft: IdentityDraft, patientType: "BARU" | "LAMA") {
  const base = { name: draft.name, whatsapp: draft.whatsapp, birthDate: draft.birthDate };
  if (patientType === "LAMA") return base;
  return { ...base, gender: draft.gender || undefined, occupation: draft.occupation, address: draft.address };
}

export function identityError(draft: IdentityDraft, patientType: "BARU" | "LAMA"): string | null {
  const checked = validateIdentity(identityPayload(draft, patientType), patientType);
  if (!checked.ok) return checked.message;
  if (!draft.consentData || !draft.consentFee) return "Centang kedua persetujuan untuk melanjutkan.";
  return null;
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

export function IdentityStep({
  patientType,
  value,
  onChange,
  bookingFee,
  onlineTotal,
}: {
  patientType: "BARU" | "LAMA";
  value: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  bookingFee: number;
  /** Diisi untuk konsultasi online: total yang ditransfer di muka (spec 4.3). */
  onlineTotal?: number;
}) {
  const set = <K extends keyof IdentityDraft>(key: K, next: IdentityDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <Field label="Nama lengkap">
        {(id) => <Input id={id} autoComplete="name" value={value.name} onChange={(e) => set("name", e.target.value)} />}
      </Field>
      <Field label="Nomor WhatsApp">
        {(id) => (
          <Input
            id={id}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812…"
            value={value.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
          />
        )}
      </Field>
      <Field label="Tanggal lahir">
        {(id) => (
          <Input
            id={id}
            type="date"
            max={witaDateString(new Date())}
            value={value.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
          />
        )}
      </Field>

      {patientType === "BARU" ? (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">Jenis kelamin</p>
            <Segmented
              label="Jenis kelamin"
              options={[
                { value: "P", label: "Perempuan" },
                { value: "L", label: "Laki-laki" },
              ]}
              value={value.gender || undefined}
              onChange={(gender) => set("gender", gender)}
            />
          </div>
          <Field label="Pekerjaan">
            {(id) => <Input id={id} value={value.occupation} onChange={(e) => set("occupation", e.target.value)} />}
          </Field>
          <Field label="Alamat">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                maxLength={200}
                value={value.address}
                onChange={(e) => set("address", e.target.value)}
                className="w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base"
              />
            )}
          </Field>
        </>
      ) : (
        <p className="text-sm text-brown-600">Data ini hanya untuk mencocokkan dengan rekam medis Anda di klinik.</p>
      )}

      <label className="flex items-start gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.consentData}
          onChange={(e) => set("consentData", e.target.checked)}
        />
        <span>
          Saya setuju data saya, termasuk jawaban kesehatan, dipakai untuk pelayanan di SunDY Clinic sesuai{" "}
          <Link href="/kebijakan-privasi" target="_blank" className="underline underline-offset-4">
            Kebijakan Privasi
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.consentFee}
          onChange={(e) => set("consentFee", e.target.checked)}
        />
        <span>
          {onlineTotal !== undefined ? (
            <>
              Saya akan mentransfer {formatRupiah(onlineTotal)} (biaya booking + Konsultasi Online). {ONLINE_FEE_TERMS}
            </>
          ) : (
            <>
              Saya akan mentransfer biaya booking {formatRupiah(bookingFee)}. {BOOKING_FEE_TERMS}
            </>
          )}
        </span>
      </label>

      {/* Kolom jebakan: tersembunyi dari manusia dan pembaca layar, diisi bot. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Situs web
          <input
            tabIndex={-1}
            autoComplete="off"
            name="website"
            value={value.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
