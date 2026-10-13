"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { validateTreatmentPackage, type TreatmentPackageInput } from "@/lib/treatment-package";
import {
  createTreatmentPackage,
  setTreatmentPackageActive,
  updateTreatmentPackage,
  type PackageServiceOption,
  type TreatmentPackageView,
} from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { StatusChip } from "../mui/status-chip";
import { EmptyState, SectionCard } from "../page-layout";
import { RupiahInput } from "../rupiah-input";

type Draft = { name: string; price: number | null; validDays: string; description: string; items: { serviceId: string; sessions: string }[] };
const EMPTY: Draft = { name: "", price: null, validDays: "180", description: "", items: [{ serviceId: "", sessions: "1" }] };

function draftOf(pkg: TreatmentPackageView): Draft {
  return {
    name: pkg.name,
    price: pkg.price,
    validDays: String(pkg.validDays),
    description: pkg.description ?? "",
    items: pkg.items.map((item) => ({ serviceId: item.serviceId, sessions: String(item.sessions) })),
  };
}

function inputOf(draft: Draft): TreatmentPackageInput {
  return {
    name: draft.name,
    price: draft.price ?? Number.NaN,
    validDays: Number(draft.validDays),
    description: draft.description,
    items: draft.items.map((item) => ({ serviceId: item.serviceId, sessions: Number(item.sessions) })),
  };
}

/** Tambah atau ubah satu paket katalog (spec paket 4). */
function PackageDialog({ pkg, services, triggerLabel }: { pkg?: TreatmentPackageView; services: PackageServiceOption[]; triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setItem = (index: number, patch: Partial<Draft["items"][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  function openDialog() {
    setDraft(pkg ? draftOf(pkg) : EMPTY);
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = inputOf(draft);
    const checked = validateTreatmentPackage(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = pkg ? await updateTreatmentPackage(pkg.id, input) : await createTreatmentPackage(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(pkg ? "Paket diperbarui." : "Paket ditambahkan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button type="button" size="small" variant={pkg ? "text" : "contained"} onClick={openDialog} aria-label={pkg ? `Ubah ${pkg.name}` : undefined}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{pkg ? "Ubah paket" : "Tambah paket"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id="package-name" label="Nama paket" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} fullWidth />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <RupiahInput id="package-price" label="Harga" value={draft.price} onChange={(price) => setDraft((d) => ({ ...d, price }))} fullWidth />
              <TextField
                id="package-days"
                label="Masa berlaku (hari)"
                type="number"
                value={draft.validDays}
                onChange={(e) => setDraft((d) => ({ ...d, validDays: e.target.value }))}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 3650, inputMode: "numeric" } }}
              />
            </Box>
            <TextField
              id="package-description"
              label="Keterangan (opsional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
            <Typography component="h3" variant="subtitle2">
              Isi paket
            </Typography>
            {draft.items.map((item, index) => (
              <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SelectField aria-label={`Treatment ${index + 1}`} value={item.serviceId} onChange={(serviceId) => setItem(index, { serviceId })}>
                  <option value="">Pilih treatment</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.categoryName})
                    </option>
                  ))}
                </SelectField>
                <TextField
                  type="number"
                  value={item.sessions}
                  onChange={(e) => setItem(index, { sessions: e.target.value })}
                  sx={{ width: 96, flexShrink: 0 }}
                  slotProps={{ htmlInput: { "aria-label": `Sesi ${index + 1}`, min: 1, max: 100, inputMode: "numeric" } }}
                />
                {draft.items.length > 1 && (
                  <Button
                    type="button"
                    size="small"
                    variant="text"
                    aria-label={`Hapus treatment ${index + 1}`}
                    onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}
                  >
                    Hapus
                  </Button>
                )}
              </Stack>
            ))}
            <Box>
              <Button type="button" size="small" variant="outlined" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { serviceId: "", sessions: "1" }] }))}>
                + Treatment
              </Button>
            </Box>
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

/** Katalog paket treatment untuk Admin Keuangan dan Super Admin (spec paket 4). */
export function TreatmentPackageCatalog({ packages, services }: { packages: TreatmentPackageView[]; services: PackageServiceOption[] }) {
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
      title="Katalog paket"
      description="Paket yang dijual resepsionis di tagihan. Mengubah paket tidak mengubah paket yang sudah dibeli customer."
      actions={<PackageDialog services={services} triggerLabel="+ Paket" />}
      flush
    >
      {packages.length === 0 ? (
        <EmptyState>Belum ada paket.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Katalog paket">
            <TableHead>
              <TableRow>
                <TableCell>Paket</TableCell>
                <TableCell>Isi</TableCell>
                <TableCell align="right">Harga</TableCell>
                <TableCell>Berlaku</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <Box component="span" sx={{ fontWeight: 500 }}>
                      {pkg.name}
                    </Box>
                    {pkg.soldCount > 0 && (
                      <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                        Terjual {pkg.soldCount}×
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{pkg.contents}</TableCell>
                  <TableCell align="right">{formatRupiah(pkg.price)}</TableCell>
                  <TableCell>{pkg.validDays} hari</TableCell>
                  <TableCell>
                    <StatusChip label={pkg.isActive ? "Aktif" : "Nonaktif"} tone={pkg.isActive ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <PackageDialog pkg={pkg} services={services} triggerLabel="Ubah" />
                      <Button
                        type="button"
                        size="small"
                        variant="text"
                        disabled={pending}
                        aria-label={`${pkg.isActive ? "Nonaktifkan" : "Aktifkan"} ${pkg.name}`}
                        onClick={() => run(() => setTreatmentPackageActive(pkg.id, !pkg.isActive), pkg.isActive ? "Paket dinonaktifkan." : "Paket diaktifkan.")}
                      >
                        {pkg.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
