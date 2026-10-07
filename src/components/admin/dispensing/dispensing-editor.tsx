"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateDispensingLine } from "@/lib/dispensing";
import { addDispensingLine, removeDispensingLine, updateDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing } from "@/server/dispensing-lifecycle";
import type { DispenseItem, DispensingDetail } from "@/server/dispensing-read";
import { useDispensingAction } from "./use-dispensing-action";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function LineRow({
  detail,
  line,
  disabled,
  run,
  fail,
}: {
  detail: DispensingDetail;
  line: DispensingDetail["lines"][number];
  disabled: boolean;
  run: ReturnType<typeof useDispensingAction>["run"];
  fail: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [usage, setUsage] = useState(line.usage);

  function save() {
    const checked = validateDispensingLine({ itemId: line.itemId, quantity: Number(quantity), usage });
    if (!checked.ok) return fail(checked.message);
    run(() =>
      updateDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id, quantity: checked.value.quantity, usage: checked.value.usage }),
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{line.itemName}</TableCell>
      <TableCell className="w-28">
        <Input aria-label={`Jumlah ${line.itemName}`} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input aria-label={`Aturan pakai ${line.itemName}`} value={usage} onChange={(e) => setUsage(e.target.value)} />
      </TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={save} aria-label={`Simpan ${line.itemName}`}>
          Simpan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          aria-label={`Hapus ${line.itemName}`}
          onClick={() => run(() => removeDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id }))}
        >
          Hapus
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Formulir penyerahan Menunggu (spec penyerahan 4.2): catatan dokter, daftar obat, lalu Selesai atau Tanpa obat. */
export function DispensingEditor({ detail, items }: { detail: DispensingDetail; items: DispenseItem[] }) {
  const { run, error, setError, pending } = useDispensingAction();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [usage, setUsage] = useState("");

  function add() {
    const input = { itemId, quantity: Number(quantity), usage };
    const checked = validateDispensingLine(input);
    if (!checked.ok) return setError(checked.message);
    run(
      () => addDispensingLine({ dispensingId: detail.id, version: detail.version, ...checked.value }),
      () => {
        setItemId("");
        setQuantity("1");
        setUsage("");
      },
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="Catatan untuk Apoteker" className="space-y-1 rounded-md border bg-muted/30 p-3">
        <h2 className="text-sm font-medium">Catatan untuk Apoteker</h2>
        <p className="whitespace-pre-wrap text-sm">{detail.note || "Tidak ada catatan."}</p>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Obat</TableHead>
            <TableHead>Jumlah</TableHead>
            <TableHead>Aturan pakai</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                Belum ada obat. Tambahkan di bawah, atau pilih Tanpa obat.
              </TableCell>
            </TableRow>
          ) : (
            detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
          )}
        </TableBody>
      </Table>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Tambah obat</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="dispense-item">Obat</Label>
            <select id="dispense-item" className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Pilih obat…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.available <= 0}>
                  {item.name} ({item.code}) — sisa {item.available} {item.unit}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dispense-quantity">Jumlah</Label>
            <Input id="dispense-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dispense-usage">Aturan pakai</Label>
            <Input id="dispense-usage" value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="mis. 3 x 1 sesudah makan" />
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={pending}>
          + Tambah obat
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || detail.lines.length > 0}
          onClick={() =>
            run(() => markNoDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Ditandai tanpa obat."))
          }
        >
          Tanpa obat
        </Button>
        <Button
          type="button"
          disabled={pending || detail.lines.length === 0}
          onClick={() => run(() => completeDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Penyerahan selesai."))}
        >
          Selesai
        </Button>
      </div>
    </div>
  );
}
