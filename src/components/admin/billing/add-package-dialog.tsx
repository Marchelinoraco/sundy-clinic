"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRupiah } from "@/lib/format";
import { addPackageLine } from "@/server/invoice-drafts";
import type { SellablePackage } from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

/** Jual paket treatment dari katalog (spec paket 5). */
export function AddPackageDialog({ invoiceId, version, packages }: { invoiceId: string; version: number; packages: SellablePackage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = packages.find((pkg) => pkg.id === packageId);

  function add() {
    if (!packageId) {
      setError("Pilih paket.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addPackageLine({ invoiceId, version, packageId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setPackageId("");
        router.refresh();
      } catch {
        setError("Gagal menambah paket. Coba lagi.");
      }
    });
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="outlined" onClick={() => setOpen(true)}>
        + Paket
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Jual paket</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {packages.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Belum ada paket aktif. Minta Admin Keuangan menambahkannya di menu Paket.
              </Typography>
            ) : (
              <SelectField id="sell-package" label="Paket" value={packageId} onChange={setPackageId}>
                <option value="">Pilih paket</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} — {formatRupiah(pkg.price)}
                  </option>
                ))}
              </SelectField>
            )}
            {chosen && (
              <Typography variant="body2">
                {chosen.contents} · berlaku {chosen.validDays} hari
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={add} disabled={pending || packages.length === 0}>
            Tambah
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
