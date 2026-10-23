"use client";

import LockOutlined from "@mui/icons-material/LockOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
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
import { formatRupiah } from "@/lib/format";
import { dispensingNotice } from "@/lib/dispensing";
import { INVOICE_LINE_KIND_LABEL, validateLineEdit } from "@/lib/invoice";
import { visitContentsLabel } from "@/lib/package-visit";
import { dateLabel } from "@/lib/stock";
import { packageOptionsSummary, type PackageOption } from "@/lib/treatment-package";
import type { ActionResult } from "@/lib/action-result";
import { counterShortages } from "@/lib/counter-stock";
import type { CounterItemRow } from "@/server/counter-read";
import { applyPackageVisit, removeInvoiceLine, refreshCatalogPrices, restoreDoctorPackage, restorePrescriptionLine, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import type { BillingItem, InvoiceDetail, InvoiceLineRow } from "@/server/invoice-read";
import type { PackageVisitPlan } from "@/server/patient-package-read";
import type { SellablePackage } from "@/server/treatment-package-catalog";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { LinkButton } from "../mui/links";
import { approvedSuffix } from "@/lib/approval";
import { RupiahInput } from "../rupiah-input";
import { useApproval } from "../approval/use-approval";
import { AddFreeLineDialog } from "./add-free-line-dialog";
import type { InternalServiceOption } from "@/server/internal-catalog";
import { AddItemDialog } from "./add-item-dialog";
import { AddPackageDialog } from "./add-package-dialog";
import { LinePerformerSelect } from "./line-performer-select";
import { PackageSessionButton } from "./package-session-button";
import { TakePackageItemDialog } from "./take-package-item-dialog";
import { CancelInvoiceDialog } from "./cancel-invoice-dialog";
import { DiscountForm } from "./discount-form";
import { InvoiceNotesForm } from "./invoice-notes-form";
import { LineDiscountDialog, LineDiscountNote } from "./line-discount-dialog";
import { ReducePrescriptionDialog } from "./reduce-prescription-dialog";
import { DeclinePackageDialog } from "./decline-package-dialog";
import { RestockRequestDialog } from "../counter/restock-request-dialog";

/** Jalankan aksi server: tampilkan kesalahan apa adanya, muat ulang halaman bila berhasil. */
export function useInvoiceAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** `action` boleh mengembalikan null: persetujuan PIN dibatalkan, tidak ada yang berubah. */
  function run<T>(action: () => Promise<ActionResult<T> | null>, onDone?: (data: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result === null) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.(result.data);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }
  return { run, error, setError, pending };
}

function LineRow({ detail, line, options, performers, disabled, run, fail, shortage }: {
  detail: InvoiceDetail;
  line: InvoiceLineRow;
  /** Stok meja kurang untuk barang baris ini (spec stok meja 4.1). */
  shortage: { needed: number; available: number } | null;
  options: readonly PackageOption[];
  performers: readonly { id: string; name: string }[];
  disabled: boolean;
  run: ReturnType<typeof useInvoiceAction>["run"];
  fail: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState<number | null>(line.quantity);
  const [unitPrice, setUnitPrice] = useState<number | null>(line.unitPrice);
  const [note, setNote] = useState(line.priceNote ?? "");
  const priceChanged = unitPrice !== line.unitPrice;
  const { withApproval, dialog } = useApproval();

  function save() {
    const input = { quantity: quantity ?? Number.NaN, unitPrice: line.packageUse ? 0 : (unitPrice ?? Number.NaN), priceNote: note };
    const checked = validateLineEdit(input, { needsNote: line.catalogLinked && priceChanged });
    if (!checked.ok) return fail(checked.message);
    run(
      () => withApproval((approval) => updateInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id, ...input, approval })),
      () => toast.success("Baris disimpan."),
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Box component="span" sx={{ fontWeight: 500 }}>
          {line.name}
        </Box>
        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
          {INVOICE_LINE_KIND_LABEL[line.kind]}
        </Typography>
        {line.priceApprovedByName && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {line.catalogLinked ? "Harga diubah" : "Baris bebas"}
            {approvedSuffix(line.priceApprovedByName)}
          </Typography>
        )}
        {dialog}
        {shortage && (
          <Typography variant="caption" component="div" sx={{ color: "warning.main" }}>
            Stok meja kurang (tersedia {shortage.available})
          </Typography>
        )}
        <LinePerformerSelect invoiceId={detail.id} version={detail.version} line={line} performers={performers} disabled={disabled} />
        <LineDiscountNote line={line} />
        {line.packageNote && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {line.packageNote}
          </Typography>
        )}
        {line.fromDoctorPackage && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            Paket dari dokter
          </Typography>
        )}
        {line.fromDispensing && (
          <Box component="span" sx={{ mt: 0.5, display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
            {/* Ikon MUI disembunyikan dari pembaca layar secara bawaan; label ini dipertahankan seperti ikon lama. */}
            <LockOutlined
              role="img"
              aria-hidden={false}
              aria-label={line.prescription ? "Dari resep dokter" : "Dari penyerahan Apoteker"}
              sx={{ fontSize: 14 }}
            />{" "}
            {line.prescription ? `Dari resep dokter · ${line.prescription.usage}` : "Dari penyerahan Apoteker"}
          </Box>
        )}
        {priceChanged && line.catalogLinked && (
          <TextField
            placeholder="Alasan harga diubah"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            sx={{ mt: 0.5 }}
            slotProps={{ htmlInput: { "aria-label": `Catatan harga ${line.name}` } }}
          />
        )}
      </TableCell>
      <TableCell sx={{ width: 96 }}>
        <TextField
          type="number"
          disabled={line.fromDispensing || line.kind === "PAKET"}
          value={quantity ?? ""}
          onChange={(e) => setQuantity(e.target.value === "" ? null : Number(e.target.value))}
          slotProps={{ htmlInput: { "aria-label": `Jumlah ${line.name}`, min: 1 } }}
        />
      </TableCell>
      <TableCell sx={{ width: 160 }}>
        {line.packageUse ? formatRupiah(0) : <RupiahInput aria-label={`Harga ${line.name}`} value={unitPrice} onChange={setUnitPrice} />}
      </TableCell>
      <TableCell align="right">
        {line.discountAmount > 0 && (
          <Typography variant="caption" component="div" sx={{ textDecoration: "line-through", color: "text.secondary" }}>
            {formatRupiah(line.gross)}
          </Typography>
        )}
        {formatRupiah(line.amount)}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
          <PackageSessionButton invoiceId={detail.id} version={detail.version} line={line} options={options} disabled={disabled} />
          {!line.packageUse && <LineDiscountDialog invoiceId={detail.id} version={detail.version} line={line} disabled={disabled} />}
          {line.fromDoctorPackage && <DeclinePackageDialog invoiceId={detail.id} version={detail.version} line={{ id: line.id, name: line.name }} disabled={disabled} />}
          {line.prescription && (
            <ReducePrescriptionDialog
              invoiceId={detail.id}
              version={detail.version}
              line={{ id: line.id, name: line.name, quantity: line.quantity, prescription: line.prescription }}
              disabled={disabled}
            />
          )}
          <Button type="button" size="small" variant="outlined" disabled={disabled} onClick={save} aria-label={`Simpan baris ${line.name}`}>
            Simpan
          </Button>
          {!line.fromDispensing && !line.fromDoctorPackage && (
            <Button
              type="button"
              size="small"
              variant="text"
              disabled={disabled}
              aria-label={`Hapus ${line.name}`}
              onClick={() => run(() => removeInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id }))}
            >
              Hapus
            </Button>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/** Editor tagihan draf (spec tagihan 4.2–4.3): baris, barang, baris bebas, diskon, lalu finalkan. */
export function InvoiceDraftEditor({
  detail,
  items,
  canExceedDiscount,
  canEditNotes = true,
  packages = [],
  packageOptions = [],
  visitPlans = [],
  performers = [],
  services = [],
  restock = null,
}: {
  detail: InvoiceDetail;
  items: BillingItem[];
  canExceedDiscount: boolean;
  canEditNotes?: boolean;
  packages?: SellablePackage[];
  packageOptions?: PackageOption[];
  /** Rencana kunjungan berikutnya tiap paket milik customer (spec jadwal paket JP8). */
  visitPlans?: PackageVisitPlan[];
  performers?: { id: string; name: string }[];
  services?: InternalServiceOption[];
  /** Resepsionis yang boleh meminta restock meja (spec stok meja 4.1); null bila tidak. */
  restock?: { branchId: string; options: CounterItemRow[] } | null;
}) {
  const { run, error, setError, pending } = useInvoiceAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { totals } = detail;

  // Resep dokter tidak melewati penyerahan Apoteker, jadi "Obat sudah diserahkan." tidak berlaku (spec resep dokter 4).
  const notice = detail.dispensingSource === "DOKTER" ? null : dispensingNotice(detail.dispensing);
  // Tagihan mengambil stok meja (spec stok meja 4.1): baris yang meja-nya kurang diberi tanda, dan resepsionis bisa
  // langsung meminta restock untuk kekurangannya.
  const shortages = counterShortages(detail.lines, new Map(items.map((item) => [item.id, item.available])));
  const requestable = restock
    ? [...shortages]
        .filter(([itemId]) => !restock.options.find((option) => option.id === itemId)?.requested)
        .map(([itemId, short]) => ({ itemId, quantity: Math.min(short.needed - short.available, 9999) }))
    : [];

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <AddItemDialog invoiceId={detail.id} version={detail.version} items={items} onError={setError} />
        <AddFreeLineDialog invoiceId={detail.id} version={detail.version} services={services} />
        <AddPackageDialog invoiceId={detail.id} version={detail.version} packages={packages} />
        <Button
          type="button"
          variant="outlined"
          disabled={pending}
          onClick={() =>
            run(
              () => refreshCatalogPrices({ invoiceId: detail.id, version: detail.version }),
              (data) => toast.success(data.updated > 0 ? `${data.updated} harga diperbarui.` : "Harga sudah sesuai katalog."),
            )
          }
        >
          Segarkan harga katalog
        </Button>
        {restock && requestable.length > 0 && <RestockRequestDialog branchId={restock.branchId} options={restock.options} initial={requestable} />}
        {detail.hasPrescription && (
          <LinkButton href={`/admin/tagihan/${detail.id}/etiket`} variant="outlined">
            Cetak etiket
          </LinkButton>
        )}
      </Stack>

      {notice && (
        <Typography role="status" variant="body2" sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover" }}>
          {notice}
        </Typography>
      )}

      {(packageOptions.length > 0 || visitPlans.length > 0) && (
        <Alert
          severity="info"
          aria-label="Paket customer"
          action={
            packageOptions.some((option) => option.itemId) ? (
              <TakePackageItemDialog invoiceId={detail.id} version={detail.version} options={packageOptions.filter((option) => option.itemId)} disabled={pending} />
            ) : undefined
          }
        >
          {packageOptions.length > 0 && <>Customer punya paket aktif: {packageOptionsSummary(packageOptions).join("; ")}.</>}
          {visitPlans.map((plan) => (
            <Stack key={plan.patientPackageId} direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                {plan.packageName} — Rencana kunjungan {plan.visit.number} ({dateLabel(plan.visit.date)}): {visitContentsLabel(plan.visit.contents)}
              </span>
              <Button
                type="button"
                size="small"
                variant="outlined"
                disabled={pending}
                aria-label={`Pakai sesuai rencana ${plan.packageName}`}
                onClick={() => run(() => applyPackageVisit({ invoiceId: detail.id, version: detail.version, patientPackageId: plan.patientPackageId }))}
              >
                Pakai sesuai rencana
              </Button>
            </Stack>
          ))}
        </Alert>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Jumlah</TableCell>
              <TableCell>Harga</TableCell>
              <TableCell align="right">Jumlah harga</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {detail.lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>
                  Belum ada baris. Tambah barang atau baris layanan.
                </TableCell>
              </TableRow>
            ) : (
              detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} options={packageOptions} performers={performers} disabled={pending} run={run} fail={setError} shortage={line.itemId ? (shortages.get(line.itemId) ?? null) : null} />)
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {detail.declinedPackages.length > 0 && (
        <Box component="section" aria-labelledby="paket-tidak-dibeli" sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
          <Typography id="paket-tidak-dibeli" component="h2" variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            Paket dari dokter yang tidak dibeli
          </Typography>
          <Stack spacing={1}>
            {detail.declinedPackages.map((row) => (
              <Stack key={row.encounterPackageId} direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                  {row.name} · {row.reason}
                </Typography>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  disabled={pending}
                  aria-label={`Kembalikan ${row.name}`}
                  onClick={() =>
                    run(
                      () => restoreDoctorPackage({ invoiceId: detail.id, version: detail.version, encounterPackageId: row.encounterPackageId }),
                      () => toast.success(`${row.name} dikembalikan ke tagihan.`),
                    )
                  }
                >
                  Kembalikan
                </Button>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {detail.droppedPrescriptions.length > 0 && (
        <Box component="section" aria-labelledby="obat-tidak-ditagih" sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
          <Typography id="obat-tidak-ditagih" component="h2" variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            Obat resep tidak ditagih
          </Typography>
          <Stack spacing={1}>
            {detail.droppedPrescriptions.map((row) => (
              <Stack key={row.dispensingLineId} direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                  {row.name} · resep {row.prescribedQuantity} · {row.reason}
                </Typography>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  disabled={pending}
                  aria-label={`Kembalikan ${row.name}`}
                  onClick={() =>
                    run(
                      () => restorePrescriptionLine({ invoiceId: detail.id, version: detail.version, dispensingLineId: row.dispensingLineId }),
                      () => toast.success(`${row.name} dikembalikan ke tagihan.`),
                    )
                  }
                >
                  Kembalikan
                </Button>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <DiscountForm detail={detail} canExceed={canExceedDiscount} run={run} fail={setError} disabled={pending} />

      <InvoiceNotesForm invoiceId={detail.id} notes={detail.notes} canEdit={canEditNotes} />

      <Box component="section" aria-label="Ringkasan tagihan" sx={{ alignSelf: "flex-end", width: "100%", maxWidth: 320, fontSize: "0.875rem" }}>
        <Stack spacing={0.5}>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <span>Subtotal</span>
            <span>{formatRupiah(totals.grossSubtotal)}</span>
          </Stack>
          {totals.itemDiscount > 0 && (
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <span>Diskon item</span>
              <span>-{formatRupiah(totals.itemDiscount)}</span>
            </Stack>
          )}
          {totals.discount > 0 && (
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <span>Diskon</span>
              <span>-{formatRupiah(totals.discount)}</span>
            </Stack>
          )}
          <Stack direction="row" sx={{ justifyContent: "space-between", fontSize: "1rem", fontWeight: 600 }}>
            <span>Total</span>
            <span>{formatRupiah(totals.total)}</span>
          </Stack>
          {/* Perkiraan potongan deposit (spec deposit D9); angka pastinya dihitung saat final. */}
          {detail.deposit.booking > 0 && (
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <span>Deposit booking (perkiraan)</span>
              <span>-{formatRupiah(detail.deposit.booking)}</span>
            </Stack>
          )}
          {detail.deposit.saldo > 0 && (
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <span>Saldo deposit (perkiraan)</span>
              <span>-{formatRupiah(detail.deposit.saldo)}</span>
            </Stack>
          )}
          {detail.deposit.booking + detail.deposit.saldo > 0 && (
            <Stack direction="row" sx={{ justifyContent: "space-between", fontWeight: 500 }}>
              <span>Sisa tagihan</span>
              <span>{formatRupiah(Math.max(0, totals.total - detail.deposit.booking - detail.deposit.saldo))}</span>
            </Stack>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
        <CancelInvoiceDialog invoiceId={detail.id} label="Draf" draft />
        <Button
          type="button"
          variant="contained"
          disabled={pending || detail.lines.length === 0 || detail.dispensing === "MENUNGGU"}
          onClick={() => setConfirmOpen(true)}
        >
          Finalkan tagihan
        </Button>
      </Stack>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Finalkan tagihan?</DialogTitle>
        <DialogCloseButton onClick={() => setConfirmOpen(false)} />
        <DialogContent>
          <DialogContentText>
            Setelah final, baris dan harga terkunci, stok barang berkurang, dan tagihan bisa dibayar. Total {formatRupiah(totals.total)}.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            type="button"
            variant="contained"
            disabled={pending}
            onClick={() =>
              run(
                () => finalizeInvoice({ invoiceId: detail.id, version: detail.version }),
                (data) => {
                  setConfirmOpen(false);
                  toast.success(`Tagihan ${data.number} final.`);
                },
              )
            }
          >
            Finalkan
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
