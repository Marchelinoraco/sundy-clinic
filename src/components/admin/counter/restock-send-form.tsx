"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { validateRestockSend } from "@/lib/counter-stock";
import { sendRestockRequest } from "@/server/restock";
import type { RestockRequestDetail } from "@/server/restock-read";
import { RejectRestockDialog } from "./reject-restock-dialog";

/** Apoteker mengisi jumlah kirim per barang, lalu Kirim ke meja atau Tolak (spec stok meja 4.2). */
export function RestockSendForm({ request }: { request: RestockRequestDetail }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.lines.map((line) => [line.id, String(Math.min(line.requestedQuantity, line.warehouseAvailable))])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const lines = request.lines.map((line) => ({ lineId: line.id, quantity: (values[line.id] ?? "").trim() === "" ? Number.NaN : Number(values[line.id]) }));
    const checked = validateRestockSend(lines, { lineIds: request.lines.map((line) => line.id) });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    const over = request.lines.find((line) => Number(values[line.id]) > line.warehouseAvailable);
    if (over) {
      setError(`Sisa gudang ${over.itemName} tidak cukup (tersedia ${over.warehouseAvailable}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendRestockRequest({ requestId: request.id, version: request.version, lines: checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Restock dikirim ke meja.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small" aria-label="Barang diminta">
            <TableHead>
              <TableRow>
                <TableCell>Barang</TableCell>
                <TableCell align="right">Diminta</TableCell>
                <TableCell align="right">Gudang tersedia</TableCell>
                <TableCell align="right">Dikirim</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {request.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{line.itemName}</TableCell>
                  <TableCell align="right">
                    {line.requestedQuantity} {line.unit}
                  </TableCell>
                  <TableCell align="right">
                    {line.warehouseAvailable} {line.unit}
                  </TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>
                    <TextField
                      type="number"
                      size="small"
                      value={values[line.id] ?? ""}
                      onChange={(e) => setValues((current) => ({ ...current, [line.id]: e.target.value }))}
                      slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": `Dikirim ${line.itemName}` } }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button type="button" variant="contained" onClick={send} disabled={pending}>
          {pending ? "Mengirim…" : "Kirim ke meja"}
        </Button>
        <RejectRestockDialog requestId={request.id} version={request.version} disabled={pending} />
      </Stack>
    </Stack>
  );
}
