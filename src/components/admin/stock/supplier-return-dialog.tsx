"use client";

import Alert from "@mui/material/Alert";
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
import { validateReturn } from "@/lib/stock";
import { createSupplierReturn } from "@/server/stock-movements";
import { DialogCloseButton } from "../mui/dialog-close-button";

type ReturnLine = { batchId: string; label: string; remaining: number; unitCost: number; unit: string };

/** Retur ke supplier dari halaman faktur (spec stok 5.5). Nilai retur mengurangi hutang faktur ini. */
export function SupplierReturnDialog({ invoiceId, lines }: { invoiceId: string; lines: ReturnLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const picked = lines
    .map((line) => ({ line, quantity: Number(quantities[line.batchId] ?? "") }))
    .filter(({ quantity }) => quantity !== 0 && !Number.isNaN(quantity));
  const total = picked.reduce((sum, { line, quantity }) => (Number.isInteger(quantity) && quantity > 0 ? sum + quantity * line.unitCost : sum), 0);

  function save() {
    const over = picked.find(({ line, quantity }) => quantity > line.remaining);
    if (over) {
      setError(`Jumlah retur ${over.line.label} melebihi sisa (${over.line.remaining} ${over.line.unit}).`);
      return;
    }
    const input = { invoiceId, lines: picked.map(({ line, quantity }) => ({ batchId: line.batchId, quantity })), note };
    const checked = validateReturn(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSupplierReturn(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Retur ${formatRupiah(total)} dicatat.`);
        setOpen(false);
        setQuantities({});
        setNote("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
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
        Retur ke supplier
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Retur ke supplier</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Isi jumlah yang dikembalikan. Stok berkurang dan hutang faktur ini berkurang sebesar nilainya.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Barang</TableCell>
                    <TableCell align="right">Jumlah</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.batchId}>
                      <TableCell>
                        {line.label}
                        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                          sisa {line.remaining} {line.unit} · {formatRupiah(line.unitCost)} per {line.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ width: 128 }}>
                        <TextField
                          id={`return-${line.batchId}`}
                          type="number"
                          value={quantities[line.batchId] ?? ""}
                          onChange={(e) => setQuantities((current) => ({ ...current, [line.batchId]: e.target.value }))}
                          slotProps={{
                            htmlInput: { "aria-label": `Jumlah retur ${line.label}`, min: 0, max: line.remaining, inputMode: "numeric" },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TextField id="return-note" label="Catatan retur" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
            <Typography variant="body2">
              Nilai retur: <strong>{formatRupiah(total)}</strong>
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan retur"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
