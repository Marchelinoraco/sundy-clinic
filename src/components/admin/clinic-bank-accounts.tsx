"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { validateClinicBankAccount, type ClinicBankAccountInput } from "@/lib/clinic-bank";
import {
  createClinicBankAccount,
  moveClinicBankAccount,
  setClinicBankAccountActive,
  updateClinicBankAccount,
  type ClinicBankAccountView,
} from "@/server/clinic-bank";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SectionCard } from "./page-layout";

const EMPTY: ClinicBankAccountInput = { bankName: "", accountNumber: "", accountHolder: "" };

/** Tambah atau ubah satu rekening klinik. */
function AccountDialog({ account, triggerLabel }: { account?: ClinicBankAccountView; triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ClinicBankAccountInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = account ? "Ubah rekening" : "Tambah rekening";
  const set = (key: keyof ClinicBankAccountInput, next: string) => setValue((v) => ({ ...v, [key]: next }));

  function openDialog() {
    setValue(account ? { bankName: account.bankName, accountNumber: account.accountNumber, accountHolder: account.accountHolder } : EMPTY);
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateClinicBankAccount(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = account ? await updateClinicBankAccount(account.id, value) : await createClinicBankAccount(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(account ? "Rekening diperbarui." : "Rekening ditambahkan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="small"
        variant={account ? "text" : "contained"}
        onClick={openDialog}
        aria-label={account ? `Ubah ${account.label}` : undefined}
      >
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id="clinic-bank-name" label="Nama bank" value={value.bankName} onChange={(e) => set("bankName", e.target.value)} fullWidth />
            <TextField
              id="clinic-bank-number"
              label="Nomor rekening"
              value={value.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              fullWidth
            />
            <TextField id="clinic-bank-holder" label="Nama pemilik" value={value.accountHolder} onChange={(e) => set("accountHolder", e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Rekening klinik penerima transfer pembayaran tagihan (spec perbaikan tagihan 7). */
export function ClinicBankAccounts({ accounts }: { accounts: ClinicBankAccountView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<void>>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Rekening klinik untuk pembayaran tagihan"
      description="Dipilih resepsionis sebagai rekening tujuan saat mencatat transfer. Rekening untuk instruksi biaya booking tetap di kartu Rekening transfer."
      actions={<AccountDialog triggerLabel="+ Rekening" />}
    >
      {accounts.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Belum ada rekening klinik.
        </Typography>
      ) : (
        <Box component="ul" aria-label="Rekening klinik" sx={{ listStyle: "none", m: 0, p: 0, "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
          {accounts.map((account, index) => (
            <Box
              component="li"
              key={account.id}
              sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, py: 1 }}
            >
              <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1, color: account.isActive ? "text.primary" : "text.secondary" }}>
                {account.label}
                {!account.isActive && <Chip label="Nonaktif" size="small" variant="outlined" />}
              </Box>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                <AccountDialog account={account} triggerLabel="Ubah" />
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  disabled={pending}
                  aria-label={`${account.isActive ? "Nonaktifkan" : "Aktifkan"} ${account.label}`}
                  onClick={() =>
                    run(() => setClinicBankAccountActive(account.id, !account.isActive), account.isActive ? "Rekening dinonaktifkan." : "Rekening diaktifkan.")
                  }
                >
                  {account.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  disabled={pending || index === 0}
                  aria-label={`Naikkan ${account.label}`}
                  onClick={() => run(() => moveClinicBankAccount(account.id, "UP"), "Urutan diperbarui.")}
                >
                  Naik
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  disabled={pending || index === accounts.length - 1}
                  aria-label={`Turunkan ${account.label}`}
                  onClick={() => run(() => moveClinicBankAccount(account.id, "DOWN"), "Urutan diperbarui.")}
                >
                  Turun
                </Button>
              </Stack>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}
