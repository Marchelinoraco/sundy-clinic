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
import type { ActionResult } from "@/lib/action-result";
import { removeInvoiceLine, refreshCatalogPrices, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import type { BillingItem, InvoiceDetail, InvoiceLineRow } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { RupiahInput } from "../rupiah-input";
import { AddFreeLineDialog } from "./add-free-line-dialog";
import { AddItemDialog } from "./add-item-dialog";
import { CancelInvoiceDialog } from "./cancel-invoice-dialog";
import { DiscountForm } from "./discount-form";

/** Jalankan aksi server: tampilkan kesalahan apa adanya, muat ulang halaman bila berhasil. */
export function useInvoiceAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, onDone?: (data: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
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

function LineRow({ detail, line, disabled, run, fail }: {
  detail: InvoiceDetail;
  line: InvoiceLineRow;
  disabled: boolean;
  run: ReturnType<typeof useInvoiceAction>["run"];
  fail: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState<number | null>(line.quantity);
  const [unitPrice, setUnitPrice] = useState<number | null>(line.unitPrice);
  const [note, setNote] = useState(line.priceNote ?? "");
  const priceChanged = unitPrice !== line.unitPrice;

  function save() {
    const input = { quantity: quantity ?? Number.NaN, unitPrice: unitPrice ?? Number.NaN, priceNote: note };
    const checked = validateLineEdit(input, { needsNote: line.catalogLinked && priceChanged });
    if (!checked.ok) return fail(checked.message);
    run(() => updateInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id, ...input }), () => toast.success("Baris disimpan."));
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
        {line.fromDispensing && (
          <Box component="span" sx={{ mt: 0.5, display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
            {/* Ikon MUI disembunyikan dari pembaca layar secara bawaan; label ini dipertahankan seperti ikon lama. */}
            <LockOutlined role="img" aria-hidden={false} aria-label="Dari penyerahan Apoteker" sx={{ fontSize: 14 }} /> Dari penyerahan Apoteker
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
          disabled={line.fromDispensing}
          value={quantity ?? ""}
          onChange={(e) => setQuantity(e.target.value === "" ? null : Number(e.target.value))}
          slotProps={{ htmlInput: { "aria-label": `Jumlah ${line.name}`, min: 1 } }}
        />
      </TableCell>
      <TableCell sx={{ width: 160 }}>
        <RupiahInput aria-label={`Harga ${line.name}`} value={unitPrice} onChange={setUnitPrice} />
      </TableCell>
      <TableCell align="right">{formatRupiah(line.amount)}</TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
          <Button type="button" size="small" variant="outlined" disabled={disabled} onClick={save} aria-label={`Simpan baris ${line.name}`}>
            Simpan
          </Button>
          {!line.fromDispensing && (
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
export function InvoiceDraftEditor({ detail, items, canExceedDiscount }: { detail: InvoiceDetail; items: BillingItem[]; canExceedDiscount: boolean }) {
  const { run, error, setError, pending } = useInvoiceAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { totals } = detail;

  const notice = dispensingNotice(detail.dispensing);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <AddItemDialog invoiceId={detail.id} version={detail.version} items={items} onError={setError} />
        <AddFreeLineDialog invoiceId={detail.id} version={detail.version} />
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
      </Stack>

      {notice && (
        <Typography role="status" variant="body2" sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover" }}>
          {notice}
        </Typography>
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
              detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <DiscountForm detail={detail} canExceed={canExceedDiscount} run={run} fail={setError} disabled={pending} />

      <Box component="section" aria-label="Ringkasan tagihan" sx={{ alignSelf: "flex-end", width: "100%", maxWidth: 320, fontSize: "0.875rem" }}>
        <Stack spacing={0.5}>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <span>Subtotal</span>
            <span>{formatRupiah(totals.subtotal)}</span>
          </Stack>
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
