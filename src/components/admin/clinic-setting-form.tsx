"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBankAccount } from "@/lib/payment";
import { MISSING_BANK_ACCOUNT_LINE } from "@/lib/transfer-instruction";
import { updateClinicSetting, type ClinicSettingView } from "@/server/clinic-setting";
import { PageHeader, SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

/** Pengaturan (spec D 5.5): kepala halaman dengan Simpan, kartu biaya booking dan rekening, pratinjau rekening. */
export function ClinicSettingForm({ setting }: { setting: ClinicSettingView }) {
  const [bookingFee, setBookingFee] = useState<number | null>(setting.bookingFee);
  const [bankName, setBankName] = useState(setting.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(setting.bankAccountNumber ?? "");
  const [bankAccountHolder, setBankAccountHolder] = useState(setting.bankAccountHolder ?? "");
  const [pending, startTransition] = useTransition();
  const preview =
    formatBankAccount({
      bankName: bankName.trim() || null,
      bankAccountNumber: bankAccountNumber.trim() || null,
      bankAccountHolder: bankAccountHolder.trim() || null,
    }) ?? MISSING_BANK_ACCOUNT_LINE;

  function handleSave() {
    if (bookingFee === null) {
      toast.error("Isi biaya booking.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateClinicSetting({ bookingFee, bankName, bankAccountNumber, bankAccountHolder });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengaturan tersimpan.");
      } catch {
        toast.error("Pengaturan gagal disimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Setiap perubahan tercatat di jejak audit."
        actions={
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SectionCard title="Biaya booking">
          <div className="space-y-2">
            <Label htmlFor="booking-fee">Biaya booking</Label>
            <RupiahInput id="booking-fee" className="max-w-48" value={bookingFee} onChange={setBookingFee} />
            <p className="text-xs text-muted-foreground">
              Berlaku untuk booking baru dari situs, WhatsApp, dan telepon. Walk-in tidak dikenai biaya. Biaya booking terpisah dari
              biaya layanan, tidak dikembalikan, dan tetap berlaku bila pasien pindah jadwal paling lambat 2 jam sebelumnya.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Rekening transfer">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="bank-name">Nama bank</Label>
              <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-number">Nomor rekening</Label>
              <Input id="bank-number" inputMode="numeric" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-holder">Atas nama</Label>
              <Input id="bank-holder" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} />
            </div>
          </div>
          <p className="mt-3 rounded-md bg-cream-100 p-3 text-sm">
            Tampil ke pasien: <strong>{preview}</strong>
          </p>
        </SectionCard>
      </div>
    </>
  );
}
