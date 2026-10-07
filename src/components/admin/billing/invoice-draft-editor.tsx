"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { Lock } from "lucide-react";
import { dispensingNotice } from "@/lib/dispensing";
import { INVOICE_LINE_KIND_LABEL, validateLineEdit } from "@/lib/invoice";
import type { ActionResult } from "@/lib/action-result";
import { removeInvoiceLine, refreshCatalogPrices, updateInvoiceLine } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import type { BillingItem, InvoiceDetail, InvoiceLineRow } from "@/server/invoice-read";
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
        <span className="font-medium">{line.name}</span>
        <div className="text-xs text-muted-foreground">{INVOICE_LINE_KIND_LABEL[line.kind]}</div>
        {line.fromDispensing && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-label="Dari penyerahan Apoteker" className="size-3" /> Dari penyerahan Apoteker
          </span>
        )}
        {priceChanged && line.catalogLinked && (
          <Input aria-label={`Catatan harga ${line.name}`} placeholder="Alasan harga diubah" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
        )}
      </TableCell>
      <TableCell className="w-24">
        <Input aria-label={`Jumlah ${line.name}`} type="number" min={1} disabled={line.fromDispensing} value={quantity ?? ""} onChange={(e) => setQuantity(e.target.value === "" ? null : Number(e.target.value))} />
      </TableCell>
      <TableCell className="w-40">
        <RupiahInput aria-label={`Harga ${line.name}`} value={unitPrice} onChange={setUnitPrice} />
      </TableCell>
      <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={save} aria-label={`Simpan baris ${line.name}`}>
          Simpan
        </Button>
        {!line.fromDispensing && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Hapus ${line.name}`} onClick={() => run(() => removeInvoiceLine({ invoiceId: detail.id, version: detail.version, lineId: line.id }))}>
            Hapus
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Editor tagihan draf (spec tagihan 4.2–4.3): baris, barang, baris bebas, diskon, lalu finalkan. */
export function InvoiceDraftEditor({ detail, items, canExceedDiscount }: { detail: InvoiceDetail; items: BillingItem[]; canExceedDiscount: boolean }) {
  const { run, error, setError, pending } = useInvoiceAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { totals } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <AddItemDialog invoiceId={detail.id} version={detail.version} items={items} onError={setError} />
        <AddFreeLineDialog invoiceId={detail.id} version={detail.version} />
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => refreshCatalogPrices({ invoiceId: detail.id, version: detail.version }), (data) => toast.success(data.updated > 0 ? `${data.updated} harga diperbarui.` : "Harga sudah sesuai katalog."))}>
          Segarkan harga katalog
        </Button>
      </div>

      {dispensingNotice(detail.dispensing) && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {dispensingNotice(detail.dispensing)}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Jumlah</TableHead>
            <TableHead>Harga</TableHead>
            <TableHead className="text-right">Jumlah harga</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                Belum ada baris. Tambah barang atau baris layanan.
              </TableCell>
            </TableRow>
          ) : (
            detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
          )}
        </TableBody>
      </Table>

      <DiscountForm detail={detail} canExceed={canExceedDiscount} run={run} fail={setError} disabled={pending} />

      <section aria-label="Ringkasan tagihan" className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(totals.subtotal)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{formatRupiah(totals.discount)}</span></div>}
        <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatRupiah(totals.total)}</span></div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <CancelInvoiceDialog invoiceId={detail.id} label="Draf" draft />
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={pending || detail.lines.length === 0 || detail.dispensing === "MENUNGGU"}>
              Finalkan tagihan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalkan tagihan?</DialogTitle>
              <DialogDescription>Setelah final, baris dan harga terkunci, stok barang berkurang, dan tagihan bisa dibayar. Total {formatRupiah(totals.total)}.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" disabled={pending} onClick={() => run(() => finalizeInvoice({ invoiceId: detail.id, version: detail.version }), (data) => { setConfirmOpen(false); toast.success(`Tagihan ${data.number} final.`); })}>
                Finalkan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
