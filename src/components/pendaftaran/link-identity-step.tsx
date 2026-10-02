"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Segmented } from "@/components/kuis/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { validateLinkIdentity, type IdentityField, type LinkIdentity } from "@/lib/kuis/identity";
import { BOOKING_FEE_TERMS } from "@/lib/payment";
import { witaDateString } from "@/lib/time";

export type LinkIdentityDraft = {
  birthDate: string;
  gender: "" | "L" | "P";
  occupation: string;
  address: string;
  consentData: boolean;
  consentFee: boolean;
  /** Kolom jebakan untuk bot. */
  website: string;
};

export const EMPTY_LINK_IDENTITY: LinkIdentityDraft = {
  birthDate: "",
  gender: "",
  occupation: "",
  address: "",
  consentData: false,
  consentFee: false,
  website: "",
};

/** Hanya kolom yang ditanyakan yang dikirim; data pasien yang terisi tidak boleh ditimpa (spec C3 3.3). */
export function linkIdentityPayload(draft: LinkIdentityDraft, missing: readonly IdentityField[]): LinkIdentity {
  const payload: LinkIdentity = {};
  if (missing.includes("birthDate")) payload.birthDate = draft.birthDate;
  if (missing.includes("gender") && draft.gender) payload.gender = draft.gender;
  if (missing.includes("occupation")) payload.occupation = draft.occupation;
  if (missing.includes("address")) payload.address = draft.address;
  return payload;
}

export function linkIdentityError(
  draft: LinkIdentityDraft,
  missing: readonly IdentityField[],
  feeConsent: { bookingFee: number } | null,
): string | null {
  const checked = validateLinkIdentity(linkIdentityPayload(draft, missing), missing);
  if (!checked.ok) return checked.message;
  if (!draft.consentData) return "Centang persetujuan data untuk melanjutkan.";
  if (feeConsent && !draft.consentFee) return "Centang persetujuan biaya booking untuk melanjutkan.";
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

/** Langkah terakhir halaman link: kolom data diri yang kosong saja, lalu persetujuan (spec C3 3.2). */
export function LinkIdentityStep({
  missing,
  feeConsent,
  value,
  onChange,
}: {
  missing: readonly IdentityField[];
  feeConsent: { bookingFee: number } | null;
  value: LinkIdentityDraft;
  onChange: (next: LinkIdentityDraft) => void;
}) {
  const set = <K extends keyof LinkIdentityDraft>(key: K, next: LinkIdentityDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      {missing.length === 0 && <p className="text-sm text-brown-600">Data diri Anda sudah lengkap di klinik.</p>}
      {missing.includes("birthDate") && (
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
      )}
      {missing.includes("gender") && (
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
      )}
      {missing.includes("occupation") && (
        <Field label="Pekerjaan">
          {(id) => <Input id={id} value={value.occupation} onChange={(e) => set("occupation", e.target.value)} />}
        </Field>
      )}
      {missing.includes("address") && (
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
      {feeConsent && (
        <label className="flex items-start gap-2 text-sm text-brown-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.consentFee}
            onChange={(e) => set("consentFee", e.target.checked)}
          />
          <span>
            Saya akan mentransfer biaya booking {formatRupiah(feeConsent.bookingFee)}. {BOOKING_FEE_TERMS}
          </span>
        </label>
      )}

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
