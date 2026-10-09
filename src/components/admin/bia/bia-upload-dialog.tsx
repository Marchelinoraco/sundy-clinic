"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { listBiaUploads, voidBiaFile, type BiaUploadSummary } from "@/server/bia-actions";
import { BiaFilePicker } from "./bia-file-picker";
import { BiaVoidDialog } from "./bia-void-dialog";

export type BiaUploadTarget = { appointmentId: string; code: string; patientName: string };

/** Dialog resepsionis di daftar Booking (spec hasil BIA 6.1): unggah dan batalkan unggahan sendiri, tanpa membuka isi berkas. */
export function BiaUploadDialog({ target, open, onOpenChange }: { target: BiaUploadTarget; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<BiaUploadSummary | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    listBiaUploads(target.appointmentId)
      .then((result) => (result.ok ? setSummary(result.data) : toast.error(result.error)))
      .catch(() => toast.error("Daftar berkas gagal dimuat. Coba lagi."));
  }, [target.appointmentId]);
  useEffect(load, [load]);

  const refresh = () => {
    load();
    router.refresh();
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} fullWidth maxWidth="sm">
      <DialogTitle>Hasil BIA — {target.code}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {target.patientName}
          </Typography>
          {summary === null ? (
            <Typography variant="body2">Memuat…</Typography>
          ) : (
            <>
              {summary.files.length === 0 ? (
                <Typography variant="body2">Belum ada berkas BIA untuk booking ini.</Typography>
              ) : (
                <Box component="ul" aria-label="Berkas BIA terunggah" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
                  {summary.files.map((file) => (
                    <Box
                      component="li"
                      key={file.id}
                      aria-label={file.originalName}
                      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", fontSize: "0.875rem" }}
                    >
                      <Box component="span" sx={{ fontWeight: 500, overflowWrap: "anywhere", minWidth: 0 }}>
                        {file.originalName}
                      </Box>
                      <Box component="span" sx={{ color: "text.secondary" }}>
                        {minutesToTimeLabel(witaMinutesOfDay(file.uploadedAt))} · {file.uploadedByName}
                      </Box>
                      {file.canVoid && (
                        <Button size="small" color="error" sx={{ ml: "auto" }} aria-label={`Batalkan ${file.originalName}`} onClick={() => setVoiding({ id: file.id, name: file.originalName })}>
                          Batalkan
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              {summary.canUpload ? (
                <BiaFilePicker appointmentId={target.appointmentId} onUploaded={refresh} />
              ) : (
                <Typography variant="body2">Unggahan sudah ditutup untuk booking ini. Minta dokter menambahkan hasil BIA.</Typography>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onOpenChange(false)}>Tutup</Button>
      </DialogActions>
      {voiding && (
        <BiaVoidDialog
          open
          title={`Batalkan berkas ${voiding.name}?`}
          description="Berkas tidak dihapus; ia ditandai dibatalkan beserta alasannya."
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            const result = await voidBiaFile({ fileId: voiding.id, reason });
            if (result.ok) {
              toast.success("Berkas dibatalkan.");
              refresh();
            }
            return result;
          }}
        />
      )}
    </Dialog>
  );
}
