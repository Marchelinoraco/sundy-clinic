"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatRupiah } from "@/lib/format";
import { DEFAULT_DUE_DAYS, isDateString, validatePurchase, type PurchaseInput } from "@/lib/stock";
import { addDaysToDateString } from "@/lib/time";
import { createPurchase } from "@/server/purchases";
import type { StockItemOption, SupplierOption } from "@/server/stock-read";
import { DateField } from "../mui/date-field";
import { ItemAutocomplete } from "../mui/item-autocomplete";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";
import { SupplierDialog } from "./supplier-dialog";

type LineDraft = { key: number; itemId: string; quantity: string; unitCost: number | null; batchNumber: string; expiryDate: string };

const emptyLine = (key: number): LineDraft => ({ key, itemId: "", quantity: "", unitCost: null, batchNumber: "", expiryDate: "" });

/**
 * Barang masuk dari faktur kertas supplier (spec stok 5.2): kepala faktur, lalu baris barang
 * dengan jumlah, harga beli, batch, dan kedaluwarsa. Aturannya diulang di server.
 */
export function PurchaseForm({
  items,
  suppliers: initialSuppliers,
  branches,
  today,
}: {
  items: StockItemOption[];
  suppliers: SupplierOption[];
  branches: { id: string; name: string }[];
  /** Hari ini dalam WITA, dari server. */
  today: string;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysToDateString(today, DEFAULT_DUE_DAYS));
  const [dueTouched, setDueTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    return Number.isInteger(quantity) && quantity > 0 && line.unitCost !== null ? sum + quantity * line.unitCost : sum;
  }, 0);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function addLine() {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function changeInvoiceDate(value: string) {
    setInvoiceDate(value);
    if (!dueTouched && isDateString(value)) setDueDate(addDaysToDateString(value, DEFAULT_DUE_DAYS));
  }

  function submit() {
    const input: PurchaseInput = {
      supplierId,
      branchId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      notes,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCost: line.unitCost ?? Number.NaN,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
      })),
    };
    const checked = validatePurchase(input, { today, kindOf: (id) => byId.get(id)?.kind ?? null });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPurchase(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/admin/stok/masuk/${result.data.id}`);
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const wide = { gridColumn: { sm: "span 2" } } as const;

  return (
    <Stack spacing={3}>
      <Paper
        component="section"
        aria-label="Faktur supplier"
        variant="outlined"
        sx={{ p: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ ...wide, flexWrap: "wrap", alignItems: "center" }}>
          <SelectField
            id="purchase-supplier"
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            fullWidth={false}
            sx={{ width: "100%", maxWidth: 384 }}
          >
            <option value="">Pilih supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </SelectField>
          <SupplierDialog
            triggerLabel="+ Supplier baru"
            onSaved={(supplier) => {
              setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)));
              setSupplierId(supplier.id);
            }}
          />
        </Stack>
        {branches.length > 1 ? (
          <SelectField id="purchase-branch" label="Cabang penerima" value={branchId} onChange={setBranchId}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary", alignSelf: "center" }}>
            Cabang penerima: {branches[0]?.name}
          </Typography>
        )}
        <TextField id="purchase-number" label="Nomor faktur" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} fullWidth />
        <DateField id="purchase-date" label="Tanggal faktur" max={today} value={invoiceDate} onChange={changeInvoiceDate} fullWidth />
        <DateField
          id="purchase-due"
          label="Jatuh tempo"
          min={invoiceDate}
          value={dueDate}
          onChange={(value) => {
            setDueTouched(true);
            setDueDate(value);
          }}
          fullWidth
        />
        <TextField id="purchase-notes" label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth sx={wide} />
      </Paper>

      <Stack component="section" aria-label="Barang di faktur" spacing={1.5}>
        {lines.map((line, index) => {
          const n = index + 1;
          const unit = byId.get(line.itemId)?.unit;
          return (
            <Paper
              key={line.key}
              component="fieldset"
              variant="outlined"
              sx={{
                m: 0,
                p: 1.5,
                minWidth: 0,
                display: "grid",
                gap: 1.5,
                // Label MUI ada di dalam isian dan tidak bisa turun baris: lima isian sebaris terlalu sempit.
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
              }}
            >
              <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
                Baris {n}
              </Box>
              <ItemAutocomplete
                label={`Barang baris ${n}`}
                items={items}
                value={line.itemId}
                onChange={(itemId) => update(line.key, { itemId })}
                sx={{ gridColumn: { sm: "span 2" } }}
              />
              <TextField
                label={`Jumlah baris ${n}`}
                type="number"
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
                fullWidth
                slotProps={{
                  htmlInput: { min: 1, inputMode: "numeric" },
                  input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
                }}
              />
              <RupiahInput
                label={`Harga beli baris ${n}`}
                placeholder="per satuan"
                value={line.unitCost}
                onChange={(next) => update(line.key, { unitCost: next })}
                fullWidth
              />
              <TextField
                label={`Batch baris ${n}`}
                placeholder="Nomor batch"
                value={line.batchNumber}
                onChange={(e) => update(line.key, { batchNumber: e.target.value })}
                fullWidth
              />
              <DateField
                label={`Kedaluwarsa baris ${n}`}
                min={today}
                value={line.expiryDate}
                onChange={(expiryDate) => update(line.key, { expiryDate })}
                fullWidth
              />
              {lines.length > 1 && (
                <Box sx={{ gridColumn: "1 / -1" }}>
                  <Button
                    type="button"
                    size="small"
                    variant="text"
                    aria-label={`Hapus baris ${n}`}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    Hapus
                  </Button>
                </Box>
              )}
            </Paper>
          );
        })}
        <Box>
          <Button type="button" variant="outlined" onClick={addLine}>
            + Tambah baris
          </Button>
        </Box>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Typography variant="body2" aria-live="polite">
          Total faktur:{" "}
          <Box component="strong" sx={{ fontSize: "1rem" }}>
            {formatRupiah(total)}
          </Box>
        </Typography>
        <Button type="button" variant="contained" onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan barang masuk"}
        </Button>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
