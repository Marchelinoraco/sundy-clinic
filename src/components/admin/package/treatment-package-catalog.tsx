"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
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
import { marginPercent } from "@/lib/costing";
import { defaultPerVisit, planVisits } from "@/lib/package-visit";
import { formatRupiah } from "@/lib/format";
import { dateLabel } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import {
  PACKAGE_GOODS_MAX,
  PACKAGE_SESSIONS_MAX,
  PACKAGE_VALID_DAYS_MAX,
  PACKAGE_VISIT_INTERVAL_DEFAULT,
  PACKAGE_VISIT_INTERVAL_MAX,
  packageCostSummary,
  packageExpiresOn,
  packagePriceError,
  validateTreatmentPackage,
  type PackageCostLine,
  type TreatmentPackageInput,
} from "@/lib/treatment-package";
import {
  createTreatmentPackage,
  setTreatmentPackageActive,
  updateTreatmentPackage,
  type CatalogPackage,
  type PackageServiceOption,
  type PackageStockOption,
  type TreatmentPackageView,
} from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { StatusChip } from "../mui/status-chip";
import { EmptyState, SectionCard } from "../page-layout";
import { RupiahInput } from "../rupiah-input";

/** Satu isi paket di form: treatment (id layanan, sesi) atau barang (id barang stok, jumlah) — spec paket barang PB1. */
/** `perVisit` kosong = otomatis dibagi rata (spec jadwal paket JP15). */
type DraftItem = { goods: boolean; id: string; sessions: string; perVisit: string };
type Draft = { name: string; price: number | null; validDays: string; visitIntervalDays: string; description: string; items: DraftItem[] };
const EMPTY: Draft = {
  name: "",
  price: null,
  validDays: "180",
  visitIntervalDays: String(PACKAGE_VISIT_INTERVAL_DEFAULT),
  description: "",
  items: [{ goods: false, id: "", sessions: "1", perVisit: "" }],
};

function draftOf(pkg: TreatmentPackageView): Draft {
  return {
    name: pkg.name,
    price: pkg.price,
    validDays: String(pkg.validDays),
    visitIntervalDays: String(pkg.visitIntervalDays),
    description: pkg.description ?? "",
    items: pkg.items.map((item) => ({
      goods: item.itemId !== null,
      id: item.itemId ?? item.serviceId ?? "",
      sessions: String(item.sessions),
      perVisit: item.perVisit === null ? "" : String(item.perVisit),
    })),
  };
}

function inputOf(draft: Draft): TreatmentPackageInput {
  return {
    name: draft.name,
    price: draft.price ?? Number.NaN,
    validDays: Number(draft.validDays),
    visitIntervalDays: Number(draft.visitIntervalDays),
    description: draft.description,
    items: draft.items.map((item) =>
      item.goods
        ? { itemId: item.id, sessions: Number(item.sessions), ...(item.perVisit.trim() ? { perVisit: Number(item.perVisit) } : {}) }
        : { serviceId: item.id, sessions: Number(item.sessions) },
    ),
  };
}

/** Tambah atau ubah satu paket katalog (spec paket 4; paket barang PB1). */
function PackageDialog({
  pkg,
  services,
  stockItems,
  triggerLabel,
}: {
  pkg?: TreatmentPackageView;
  services: PackageServiceOption[];
  stockItems: PackageStockOption[];
  triggerLabel: string;
}) {
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

  const today = witaDateString(new Date());
  const days = Number(draft.validDays);
  const daysValid = Number.isInteger(days) && days >= 1 && days <= PACKAGE_VALID_DAYS_MAX;
  const interval = Number(draft.visitIntervalDays);
  const intervalValid = Number.isInteger(interval) && interval >= 1 && interval <= PACKAGE_VISIT_INTERVAL_MAX;
  // Rencana kunjungan contoh mulai hari ini (spec jadwal paket JP2–JP3): treatment 1 sesi, barang per kunjungan atau bawaan.
  const maxSessions = Math.max(0, ...draft.items.filter((item) => !item.goods && item.id).map((item) => Number(item.sessions) || 0));
  const autoPerVisit = (item: DraftItem) => defaultPerVisit(Number(item.sessions) || 0, maxSessions);
  const visits = intervalValid
    ? planVisits({
        nextVisitOn: today,
        intervalDays: interval,
        visitsDone: 0,
        items: draft.items
          .filter((item) => item.id && Number(item.sessions) > 0)
          .map((item) => ({
            name: item.id,
            unit: null,
            remaining: Number(item.sessions),
            perVisit: item.goods ? Number(item.perVisit) > 0 ? Number(item.perVisit) : autoPerVisit(item) : null,
          })),
      })
    : [];
  const planDays = visits.length > 0 ? (visits.length - 1) * interval : 0;
  // Isi yang sudah dipilih saja yang dihitung; harga jual dan biaya per satuan dari katalog (spec paket informatif PI1).
  const lines: PackageCostLine[] = draft.items.flatMap((item) => {
    const quantity = Number(item.sessions) > 0 ? Number(item.sessions) : 0;
    if (item.goods) {
      const stock = stockItems.find((option) => option.id === item.id);
      return stock ? [{ name: stock.name, unitPrice: stock.sellPrice, unitCost: stock.lastUnitCost, quantity }] : [];
    }
    const service = services.find((option) => option.id === item.id);
    return service ? [{ name: service.name, unitPrice: service.price, unitCost: service.costPerSession, quantity }] : [];
  });
  const price = draft.price ?? 0;
  const summary = packageCostSummary(price, lines);
  // Harga belum diisi: hanya barang tanpa harga beli yang sudah perlu ditandai (PI3, PI4).
  const costError = draft.price === null && summary.missing.length === 0 ? null : packagePriceError(price, summary);
  const percentOf = (part: number, whole: number) => {
    const value = marginPercent(part, whole);
    return value === null ? "" : ` (${value.toLocaleString("id-ID")}%)`;
  };

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
            <TextField
              id="package-name"
              label="Nama paket"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              helperText="Tampil di tagihan, struk, dan kartu paket customer."
              fullWidth
            />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <RupiahInput
                id="package-price"
                label="Harga paket"
                value={draft.price}
                onChange={(price) => setDraft((d) => ({ ...d, price }))}
                helperText="Dibayar customer sekali untuk seluruh isi paket."
                error={draft.price !== null && summary.complete && summary.cost > price}
                fullWidth
              />
              <TextField
                id="package-days"
                label="Masa berlaku (hari)"
                type="number"
                value={draft.validDays}
                onChange={(e) => setDraft((d) => ({ ...d, validDays: e.target.value }))}
                helperText={daysValid ? `Sejak dibeli. Bila dibeli hari ini: s.d. ${dateLabel(packageExpiresOn(today, days))}.` : `1–${PACKAGE_VALID_DAYS_MAX} hari.`}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: PACKAGE_VALID_DAYS_MAX, inputMode: "numeric" } }}
              />
            </Box>
            <TextField
              id="package-interval"
              label="Jarak antar kunjungan (hari)"
              type="number"
              value={draft.visitIntervalDays}
              onChange={(e) => setDraft((d) => ({ ...d, visitIntervalDays: e.target.value }))}
              helperText={intervalValid ? `Kunjungan 1 di hari beli bila langsung dipakai, bila tidak ${interval} hari kemudian. Berikutnya tiap ${interval} hari.` : `1–${PACKAGE_VISIT_INTERVAL_MAX} hari.`}
              error={!intervalValid}
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: PACKAGE_VISIT_INTERVAL_MAX, inputMode: "numeric" } }}
            />
            <TextField
              id="package-description"
              label="Keterangan (opsional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              helperText="Catatan internal untuk staf; tidak tampil di tagihan atau struk."
              fullWidth
              multiline
              minRows={2}
            />
            <Box>
              <Typography component="h3" variant="subtitle2">
                Isi paket
              </Typography>
              <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                Sesi treatment dipakai di tagihan; obat dan produk diambil bertahap dari stok meja.
              </Typography>
            </Box>
            {draft.items.map((item, index) => {
              const n = index + 1;
              const stock = item.goods ? stockItems.find((option) => option.id === item.id) : undefined;
              const service = item.goods ? undefined : services.find((option) => option.id === item.id);
              const unit = item.goods ? (stock?.unit ?? "") : "sesi";
              const quantity = Number(item.sessions) > 0 ? Number(item.sessions) : 0;
              const missingCost = stock !== undefined && stock.lastUnitCost === null;
              const kind = item.goods ? "Obat / produk" : "Treatment";
              const info = service
                ? `Harga jual ${formatRupiah(service.price)}/sesi · biaya ${formatRupiah(service.costPerSession)}/sesi`
                : stock
                  ? missingCost
                    ? "Harga beli belum diisi. Isi di Stok → Barang masuk."
                    : `Harga jual ${stock.sellPrice === null ? "belum diisi" : `${formatRupiah(stock.sellPrice)}/${stock.unit}`} · harga beli terakhir ${formatRupiah(stock.lastUnitCost ?? 0)}/${stock.unit}`
                  : item.goods
                    ? "Pilih obat atau produk dari stok."
                    : "Pilih treatment dari katalog layanan.";
              const unitPrice = service?.price ?? stock?.sellPrice ?? null;
              const unitCost = service ? service.costPerSession : (stock?.lastUnitCost ?? null);
              return (
                <Box
                  key={index}
                  role="group"
                  aria-label={`Isi paket ${n}`}
                  sx={{ border: 1, borderColor: missingCost ? "error.light" : "divider", borderRadius: 1.5, p: 1.5, bgcolor: missingCost ? "action.hover" : undefined }}
                >
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="overline" sx={{ color: "primary.main", lineHeight: 1.5 }}>
                      {kind} {n}
                    </Typography>
                    {draft.items.length > 1 && (
                      <Button
                        type="button"
                        size="small"
                        variant="text"
                        aria-label={`Hapus ${kind.toLowerCase()} ${n}`}
                        onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}
                      >
                        Hapus
                      </Button>
                    )}
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <SelectField
                      label={kind}
                      aria-label={`${kind} ${n}`}
                      value={item.id}
                      onChange={(id) => setItem(index, { id })}
                      helperText={info}
                      error={missingCost}
                    >
                      {item.goods ? (
                        <>
                          <option value="">Pilih obat atau produk</option>
                          {stockItems.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} ({option.kindLabel}, {option.unit})
                            </option>
                          ))}
                        </>
                      ) : (
                        <>
                          <option value="">Pilih treatment</option>
                          {services.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} ({option.categoryName})
                            </option>
                          ))}
                        </>
                      )}
                    </SelectField>
                    <TextField
                      label={item.goods ? "Jumlah" : "Jumlah sesi"}
                      type="number"
                      value={item.sessions}
                      onChange={(e) => setItem(index, { sessions: e.target.value })}
                      helperText={item.goods ? `1–${PACKAGE_GOODS_MAX.toLocaleString("id-ID")}${unit ? ` ${unit}` : ""}` : `1–${PACKAGE_SESSIONS_MAX} sesi`}
                      sx={{ width: { xs: "100%", sm: 170 }, flexShrink: 0 }}
                      slotProps={{
                        htmlInput: { "aria-label": `${item.goods ? "Jumlah" : "Jumlah sesi"} ${n}`, min: 1, max: item.goods ? PACKAGE_GOODS_MAX : PACKAGE_SESSIONS_MAX, inputMode: "numeric" },
                        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
                      }}
                    />
                  </Stack>
                  {item.goods && (
                    <TextField
                      label="Per kunjungan"
                      type="number"
                      value={item.perVisit}
                      onChange={(e) => setItem(index, { perVisit: e.target.value })}
                      helperText={item.perVisit.trim() ? `1–${quantity || 1}${unit ? ` ${unit}` : ""} diserahkan tiap kunjungan` : `Otomatis ${autoPerVisit(item)}${unit ? ` ${unit}` : ""} bila dikosongkan`}
                      sx={{ mt: 1, width: { xs: "100%", sm: 240 } }}
                      slotProps={{
                        htmlInput: { "aria-label": `Per kunjungan ${n}`, min: 1, max: quantity || 1, inputMode: "numeric" },
                        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
                      }}
                    />
                  )}
                  {(service || stock) && (
                    <Stack direction="row" sx={{ justifyContent: "space-between", mt: 1, pt: 1, borderTop: 1, borderColor: "divider", borderTopStyle: "dashed" }}>
                      <Typography variant="caption">Nilai normal {formatRupiah((unitPrice ?? 0) * quantity)}</Typography>
                      <Typography variant="caption">{unitCost === null ? "Biaya belum diketahui" : `Biaya ${formatRupiah(unitCost * quantity)}`}</Typography>
                    </Stack>
                  )}
                </Box>
              );
            })}
            <Stack direction="row" spacing={1}>
              <Button type="button" size="small" variant="outlined" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { goods: false, id: "", sessions: "1", perVisit: "" }] }))}>
                + Treatment
              </Button>
              {stockItems.length > 0 && (
                <Button type="button" size="small" variant="outlined" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { goods: true, id: "", sessions: "1", perVisit: "" }] }))}>
                  + Obat / produk
                </Button>
              )}
            </Stack>
            <Box component="section" aria-label="Ringkasan paket" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover", fontSize: "0.875rem" }}>
              <SummaryRow label="Nilai normal isi paket" note="harga jual semua isi bila dibeli satuan" value={formatRupiah(summary.normalValue)} />
              <SummaryRow label="Harga paket" value={draft.price === null ? "—" : formatRupiah(price)} />
              {draft.price !== null && <SummaryRow label="Customer hemat" value={`${formatRupiah(summary.saving)}${percentOf(summary.saving, summary.normalValue)}`} />}
              <SummaryRow label="Total biaya isi paket" note="biaya treatment + harga beli barang" value={summary.complete ? formatRupiah(summary.cost) : "belum lengkap"} />
              <SummaryRow
                label="Selisih harga paket − biaya"
                value={summary.complete && draft.price !== null ? `${formatRupiah(summary.margin)}${percentOf(summary.margin, price)}` : "belum bisa dihitung"}
                tone={summary.complete && draft.price !== null ? (summary.margin < 0 ? "error.main" : "success.main") : "error.main"}
                strong
              />
              {visits.length > 0 && <SummaryRow label="Rencana kunjungan" value={`${visits.length} kunjungan, ±${planDays} hari`} />}
            </Box>
            {daysValid && visits.length > 0 && planDays >= days && (
              <Alert severity="warning" role="status">
                Rencana kunjungan melewati masa berlaku paket.
              </Alert>
            )}
            {(costError ?? error) && <Alert severity="error">{costError ?? error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending || costError !== null} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Satu baris ringkasan paket: label (dengan penjelasan kecil) dan nilainya. */
function SummaryRow({ label, note, value, tone, strong = false }: { label: string; note?: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <Stack
      direction="row"
      sx={{ justifyContent: "space-between", gap: 2, py: 0.25, color: tone, fontWeight: strong ? 700 : undefined, ...(strong ? { borderTop: 1, borderColor: "divider", mt: 0.5, pt: 0.75 } : {}) }}
    >
      <span>
        {label}
        {note && (
          <Typography variant="caption" component="span" sx={{ display: "block", color: "text.secondary", fontWeight: 400 }}>
            {note}
          </Typography>
        )}
      </span>
      <span>{value}</span>
    </Stack>
  );
}

/** Katalog paket untuk Admin Keuangan dan Super Admin (spec paket 4): isi treatment, obat, dan produk. */
export function TreatmentPackageCatalog({
  packages,
  services,
  stockItems = [],
}: {
  packages: CatalogPackage[];
  services: PackageServiceOption[];
  stockItems?: PackageStockOption[];
}) {
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
      description="Paket yang dijual resepsionis di tagihan, berisi treatment, obat, atau produk. Mengubah paket tidak mengubah paket yang sudah dibeli customer."
      actions={<PackageDialog services={services} stockItems={stockItems} triggerLabel="+ Paket" />}
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
                <TableCell align="right">Biaya isi</TableCell>
                <TableCell align="right">Selisih</TableCell>
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
                  <TableCell align="right">{pkg.cost === null ? "—" : formatRupiah(pkg.cost)}</TableCell>
                  <TableCell align="right">
                    <PackageMarginCell price={pkg.price} cost={pkg.cost} />
                  </TableCell>
                  <TableCell>{pkg.validDays} hari</TableCell>
                  <TableCell>
                    <StatusChip label={pkg.isActive ? "Aktif" : "Nonaktif"} tone={pkg.isActive ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <PackageDialog pkg={pkg} services={services} stockItems={stockItems} triggerLabel="Ubah" />
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

/**
 * Selisih harga paket − biaya isi di tabel (spec paket informatif PI6): paket yang jadi rugi karena biaya naik ditandai,
 * tanpa diblokir; paket berisi barang tanpa harga beli belum bisa dihitung.
 */
function PackageMarginCell({ price, cost }: { price: number; cost: number | null }) {
  if (cost === null) {
    return (
      <Typography variant="caption" sx={{ color: "warning.main" }}>
        Harga beli belum lengkap
      </Typography>
    );
  }
  const margin = price - cost;
  const percent = marginPercent(margin, price);
  return (
    <>
      <Box component="span" sx={{ color: margin < 0 ? "error.main" : undefined, fontWeight: 500 }}>
        {formatRupiah(margin)}
      </Box>
      <Typography variant="caption" component="div" sx={{ color: margin < 0 ? "error.main" : "text.secondary" }}>
        {margin < 0 ? "Biaya naik, perbarui harga" : percent === null ? "" : `${percent.toLocaleString("id-ID")}%`}
      </Typography>
    </>
  );
}
