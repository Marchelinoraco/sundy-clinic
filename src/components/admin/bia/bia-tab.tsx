"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BIA_FIELDS, BIA_KEYS, biaFieldLabel, biaInputValue, type BiaInput } from "@/lib/bia";
import { formatDecimal } from "@/lib/encounter";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BiaFileView, BiaMeasurementView, BiaVisitView } from "@/server/bia-read";
import { saveBiaNumbers, startBiaMeasurement, voidBiaFile, voidBiaMeasurement } from "@/server/bia-actions";
import { BiaFilePicker } from "./bia-file-picker";
import { BiaVoidDialog } from "./bia-void-dialog";

const fileUrl = (id: string, download = false) => `/admin/bia/berkas/${id}${download ? "?unduh=1" : ""}`;
const clock = (date: Date) => minutesToTimeLabel(witaMinutesOfDay(date));

function inputsOf(measurement: BiaMeasurementView): BiaInput {
  return Object.fromEntries(BIA_KEYS.map((key) => [key, biaInputValue(key, measurement.numbers[key])])) as BiaInput;
}

function FileList({ files, canVoid, onPreview, onVoid }: { files: BiaFileView[]; canVoid: boolean; onPreview: (file: BiaFileView) => void; onVoid: (file: BiaFileView) => void }) {
  if (files.length === 0) return <Typography variant="body2">Belum ada berkas untuk pengukuran ini.</Typography>;
  return (
    <Box component="ul" aria-label="Berkas hasil BIA" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
      {files.map((file) => (
        <Box component="li" key={file.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, fontSize: "0.875rem", opacity: file.voided ? 0.7 : 1 }}>
          <Box component="span" sx={{ fontWeight: 500, overflowWrap: "anywhere", minWidth: 0, textDecoration: file.voided ? "line-through" : "none" }}>
            {file.originalName}
          </Box>
          <Box component="span" sx={{ color: "text.secondary" }}>
            {clock(file.uploadedAt)} · {file.uploadedByName}
          </Box>
          {file.voided && (
            <Box component="span" sx={{ color: "error.main" }}>
              Dibatalkan: {file.voided.reason}
            </Box>
          )}
          <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
            {!file.previewable ? (
              <Link href={fileUrl(file.id, true)} aria-label={`Unduh ${file.originalName}`}>
                Unduh
              </Link>
            ) : file.mimeType === "application/pdf" ? (
              <Link href={fileUrl(file.id)} target="_blank" rel="noopener" aria-label={`Buka ${file.originalName}`}>
                Buka
              </Link>
            ) : (
              <Button size="small" aria-label={`Buka ${file.originalName}`} onClick={() => onPreview(file)}>
                Buka
              </Button>
            )}
            {canVoid && !file.voided && (
              <Button size="small" color="error" aria-label={`Batalkan ${file.originalName}`} onClick={() => onVoid(file)}>
                Batalkan
              </Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function NumbersReadOnly({ measurement }: { measurement: BiaMeasurementView }) {
  if (!measurement.numbersAt) return <Typography variant="body2">Angka BIA belum diisi.</Typography>;
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, fontSize: "0.875rem" }}>
      {BIA_FIELDS.filter((spec) => measurement.numbers[spec.key] !== null).map((spec) => (
        <Box key={spec.key} sx={{ display: "contents" }}>
          <Box component="dt" sx={{ color: "text.secondary" }}>
            {spec.label}
          </Box>
          <Box component="dd" sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}>
            {formatDecimal(measurement.numbers[spec.key]!, spec.decimals)}
            {spec.unit ? ` ${spec.unit}` : ""}
          </Box>
        </Box>
      ))}
      {measurement.note && (
        <Box sx={{ gridColumn: "1 / -1", whiteSpace: "pre-line" }}>Catatan: {measurement.note}</Box>
      )}
    </Box>
  );
}

function NumbersForm({
  measurement,
  onSaved,
  onUnsavedChange,
}: {
  measurement: BiaMeasurementView;
  onSaved: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const [values, setValues] = useState<BiaInput>(() => inputsOf(measurement));
  const [note, setNote] = useState(measurement.note ?? "");
  // Dokter yang menutup halaman atau memfinalisasi tanpa menyimpan kehilangan ketikannya; kabarkan induknya.
  const unsaved = BIA_KEYS.some((key) => values[key] !== biaInputValue(key, measurement.numbers[key])) || note !== (measurement.note ?? "");
  useEffect(() => {
    onUnsavedChange?.(unsaved);
    return () => onUnsavedChange?.(false);
  }, [unsaved, onUnsavedChange]);
  const [version, setVersion] = useState(measurement.version);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const result = await saveBiaNumbers({ measurementId: measurement.id, version, numbers: values, note });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setVersion(result.data.version);
    toast.success("Angka BIA tersimpan.");
    onSaved();
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); void save(); }} aria-label="Angka BIA">
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
        {BIA_FIELDS.map((spec) => (
          <TextField
            key={spec.key}
            label={biaFieldLabel(spec)}
            value={values[spec.key]}
            onChange={(event) => setValues((current) => ({ ...current, [spec.key]: event.target.value }))}
            slotProps={{ htmlInput: { inputMode: spec.decimals === 0 ? "numeric" : "decimal" } }}
          />
        ))}
      </Box>
      <TextField label="Catatan BIA (opsional)" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} />
      {error && (
        <Typography role="alert" variant="body2" sx={{ color: "error.main" }}>
          {error}
        </Typography>
      )}
      <Box>
        <Button type="submit" variant="contained" disabled={pending}>
          Simpan angka BIA
        </Button>
      </Box>
    </Stack>
  );
}

/** Tab BIA halaman kunjungan (spec hasil BIA 6.2). */
export function BiaTab({ bia, appointmentId, onUnsavedChange }: { bia: BiaVisitView; appointmentId: string; onUnsavedChange?: (unsaved: boolean) => void }) {
  const router = useRouter();
  const { active, access, final } = bia;
  const locked = final && active?.numbersAt != null;
  const [preview, setPreview] = useState<BiaFileView | null>(null);
  const [voidingFile, setVoidingFile] = useState<BiaFileView | null>(null);
  const [voidingMeasurement, setVoidingMeasurement] = useState(false);
  const refresh = () => router.refresh();

  async function start() {
    const result = await startBiaMeasurement(appointmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    refresh();
  }

  return (
    <Stack spacing={2}>
      {!active ? (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="body2">Belum ada hasil BIA untuk kunjungan ini.</Typography>
          {(access.upload || access.editNumbers) && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Unggah foto atau PDF hasil timbang di bawah, lalu isi angkanya.
              {access.editNumbers ? " Tanpa berkas pun angka bisa diisi lewat tombol di bawah." : ""}
            </Typography>
          )}
          {access.editNumbers && (
            <Button size="small" onClick={() => void start()}>
              Isi angka tanpa berkas
            </Button>
          )}
        </Stack>
      ) : (
        <>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Diukur {clock(active.createdAt)} · dicatat {active.createdByName}
            {active.numbersByName ? ` · angka oleh ${active.numbersByName}` : ""}
          </Typography>
          <FileList files={active.files} canVoid={access.voidAny} onPreview={setPreview} onVoid={setVoidingFile} />
        </>
      )}
      {access.upload && !locked && <BiaFilePicker appointmentId={appointmentId} onUploaded={refresh} />}
      {active && (access.editNumbers && !locked ? <NumbersForm key={`${active.id}-${active.version}`} measurement={active} onSaved={refresh} onUnsavedChange={onUnsavedChange} /> : <NumbersReadOnly measurement={active} />)}
      {active && access.voidAny && (
        <Box>
          <Button color="error" size="small" onClick={() => setVoidingMeasurement(true)}>
            Batalkan pengukuran
          </Button>
        </Box>
      )}
      {bia.voided.length > 0 && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {bia.voided.length} pengukuran dibatalkan: {bia.voided.map((m) => m.voided?.reason).join("; ")}
        </Typography>
      )}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} maxWidth="md" fullWidth aria-labelledby="bia-preview-title">
        <DialogTitle id="bia-preview-title">{preview?.originalName}</DialogTitle>
        <DialogContent>
          {preview && <Box component="img" src={fileUrl(preview.id)} alt={`Hasil BIA ${preview.originalName}`} sx={{ display: "block", maxWidth: "100%", mx: "auto" }} />}
        </DialogContent>
        <DialogActions>
          {preview && <Link href={fileUrl(preview.id, true)}>Unduh</Link>}
          <Button onClick={() => setPreview(null)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      {voidingFile && (
        <BiaVoidDialog
          open
          title={`Batalkan berkas ${voidingFile.originalName}?`}
          description="Berkas tidak dihapus; ia ditandai dibatalkan beserta alasannya."
          onClose={() => setVoidingFile(null)}
          onConfirm={async (reason) => {
            const result = await voidBiaFile({ fileId: voidingFile.id, reason });
            if (result.ok) refresh();
            return result;
          }}
        />
      )}
      {active && voidingMeasurement && (
        <BiaVoidDialog
          open
          title="Batalkan pengukuran BIA ini?"
          description="Angka dan berkasnya tetap tersimpan sebagai dibatalkan. Setelah itu Anda bisa mengisi pengukuran baru."
          onClose={() => setVoidingMeasurement(false)}
          onConfirm={async (reason) => {
            const result = await voidBiaMeasurement({ measurementId: active.id, reason });
            if (result.ok) refresh();
            return result;
          }}
        />
      )}
    </Stack>
  );
}
