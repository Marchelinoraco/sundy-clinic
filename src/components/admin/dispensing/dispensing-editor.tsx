"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
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
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { toast } from "sonner";
import { USAGE_MAX, validateDispensingLine } from "@/lib/dispensing";
import { composeUsage, newUsageParts, parseUsage, usageProblem, type UsageParts } from "@/lib/usage";
import { addDispensingLine, removeDispensingLine, updateDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing } from "@/server/dispensing-lifecycle";
import type { DispenseItem, DispensingDetail } from "@/server/dispensing-read";
import { ItemAutocomplete } from "../mui/item-autocomplete";
import { UsageField } from "../usage-field";
import { useDispensingAction } from "./use-dispensing-action";

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
  // Teks tersimpan dibuka sebagai isian; yang tidak disentuh tersimpan utuh (spec aturan pakai AP5).
  const [usage, setUsage] = useState<UsageParts>(() => parseUsage(line.usage));

  function save() {
    const problem = usageProblem(usage, USAGE_MAX);
    if (problem) return fail(problem);
    const checked = validateDispensingLine({ itemId: line.itemId, quantity: Number(quantity), usage: composeUsage(usage) });
    if (!checked.ok) return fail(checked.message);
    run(() =>
      updateDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id, quantity: checked.value.quantity, usage: checked.value.usage }),
    );
  }

  return (
    <TableRow>
      <TableCell sx={{ fontWeight: 500 }}>{line.itemName}</TableCell>
      <TableCell sx={{ width: 112 }}>
        <TextField
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": `Jumlah ${line.itemName}`, min: 1 } }}
        />
      </TableCell>
      <TableCell>
        <UsageField value={usage} onChange={setUsage} name={line.itemName} />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
          <Button type="button" size="small" variant="outlined" disabled={disabled} onClick={save} aria-label={`Simpan ${line.itemName}`}>
            Simpan
          </Button>
          <Button
            type="button"
            size="small"
            variant="text"
            disabled={disabled}
            aria-label={`Hapus ${line.itemName}`}
            onClick={() => run(() => removeDispensingLine({ dispensingId: detail.id, version: detail.version, lineId: line.id }))}
          >
            Hapus
          </Button>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/** Formulir penyerahan Menunggu (spec penyerahan 4.2): catatan dokter, daftar obat, lalu Selesai atau Tanpa obat. */
export function DispensingEditor({ detail, items }: { detail: DispensingDetail; items: DispenseItem[] }) {
  const { run, error, setError, pending } = useDispensingAction();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [usage, setUsage] = useState<UsageParts>(newUsageParts);

  function add() {
    // Urutan pesan: obat, aturan pakai (spec aturan pakai AP6), lalu jumlah dan panjang teks dari validasi server.
    const checked = validateDispensingLine({ itemId, quantity: Number(quantity), usage: composeUsage(usage) });
    if (!checked.ok && !itemId) return setError(checked.message);
    const problem = usageProblem(usage, USAGE_MAX);
    if (problem) return setError(problem);
    if (!checked.ok) return setError(checked.message);
    run(
      () => addDispensingLine({ dispensingId: detail.id, version: detail.version, ...checked.value }),
      () => {
        setItemId("");
        setQuantity("1");
        setUsage(newUsageParts());
      },
    );
  }

  return (
    <Stack spacing={3}>
      <Paper component="section" aria-label="Catatan untuk Apoteker" variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
        <Typography component="h2" sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
          Catatan untuk Apoteker
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {detail.note || "Tidak ada catatan."}
        </Typography>
      </Paper>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Obat</TableCell>
              <TableCell>Jumlah</TableCell>
              <TableCell>Aturan pakai</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {detail.lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                  Belum ada obat. Tambahkan di bawah, atau pilih Tanpa obat.
                </TableCell>
              </TableRow>
            ) : (
              detail.lines.map((line) => <LineRow key={`${line.id}-${detail.version}`} detail={detail} line={line} disabled={pending} run={run} fail={setError} />)
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
        <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
          Tambah obat
        </Box>
        <Stack spacing={1.5}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 7rem" } }}>
            <ItemAutocomplete id="dispense-item" label="Obat" items={items} value={itemId} onChange={setItemId} showStock />
            <TextField
              id="dispense-quantity"
              label="Jumlah"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </Box>
          <UsageField value={usage} onChange={setUsage} />
          <Box>
            <Button type="button" size="small" variant="outlined" onClick={add} disabled={pending}>
              + Tambah obat
            </Button>
          </Box>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Button
          type="button"
          variant="outlined"
          disabled={pending || detail.lines.length > 0}
          onClick={() =>
            run(() => markNoDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Ditandai tanpa obat."))
          }
        >
          Tanpa obat
        </Button>
        <Button
          type="button"
          variant="contained"
          disabled={pending || detail.lines.length === 0}
          onClick={() => run(() => completeDispensing({ dispensingId: detail.id, version: detail.version }), () => toast.success("Penyerahan selesai."))}
        >
          Selesai
        </Button>
      </Stack>
    </Stack>
  );
}
