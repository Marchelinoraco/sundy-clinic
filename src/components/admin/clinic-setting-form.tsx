"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
          <Button variant="contained" onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
        }
      />
      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1.4fr)" } }}>
        <SectionCard title="Biaya booking">
          <RupiahInput id="booking-fee" label="Biaya booking" value={bookingFee} onChange={setBookingFee} sx={{ maxWidth: 192 }} />
          <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 1 }}>
            Berlaku untuk booking baru dari situs, WhatsApp, dan telepon. Walk-in tidak dikenai biaya. Biaya booking terpisah dari
            biaya layanan, tidak dikembalikan, dan tetap berlaku bila pasien pindah jadwal paling lambat 2 jam sebelumnya.
          </Typography>
        </SectionCard>
        <SectionCard title="Rekening transfer">
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
            <TextField id="bank-name" label="Nama bank" value={bankName} onChange={(e) => setBankName(e.target.value)} fullWidth />
            <TextField
              id="bank-number"
              label="Nomor rekening"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              fullWidth
            />
            <TextField id="bank-holder" label="Atas nama" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} fullWidth />
          </Box>
          <Typography variant="body2" sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>
            Tampil ke pasien: <strong>{preview}</strong>
          </Typography>
        </SectionCard>
      </Box>
    </>
  );
}
