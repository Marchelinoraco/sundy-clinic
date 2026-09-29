"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClinicSetting, type ClinicSettingView } from "@/server/clinic-setting";

export function ClinicSettingForm({ setting }: { setting: ClinicSettingView }) {
  const [bookingFee, setBookingFee] = useState(String(setting.bookingFee));
  const [bankName, setBankName] = useState(setting.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(setting.bankAccountNumber ?? "");
  const [bankAccountHolder, setBankAccountHolder] = useState(setting.bankAccountHolder ?? "");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await updateClinicSetting({
          bookingFee: Number(bookingFee),
          bankName,
          bankAccountNumber,
          bankAccountHolder,
        });
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
    <div className="max-w-lg space-y-4">
      <div className="space-y-1">
        <Label htmlFor="booking-fee">Biaya booking (rupiah)</Label>
        <Input
          id="booking-fee"
          inputMode="numeric"
          value={bookingFee}
          onChange={(e) => setBookingFee(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Berlaku untuk booking baru dari situs, WhatsApp, dan telepon. Walk-in tidak dikenai biaya.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-name">Nama bank</Label>
        <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-number">Nomor rekening</Label>
        <Input
          id="bank-number"
          inputMode="numeric"
          value={bankAccountNumber}
          onChange={(e) => setBankAccountNumber(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bank-holder">Atas nama</Label>
        <Input
          id="bank-holder"
          value={bankAccountHolder}
          onChange={(e) => setBankAccountHolder(e.target.value)}
        />
      </div>
      <Button onClick={handleSave} disabled={pending}>
        Simpan Pengaturan
      </Button>
    </div>
  );
}
