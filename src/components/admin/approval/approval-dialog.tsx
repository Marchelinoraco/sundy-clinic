"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, type FormEvent } from "react";
import { NO_APPROVERS, validatePin, type ApprovalInput } from "@/lib/approval";
import { listApprovers } from "@/server/approval-pin";
import { SelectField } from "../mui/select-field";

/**
 * Kotak Persetujuan (spec PIN P7, P12): Admin Keuangan atau Super Admin memilih namanya dan mengetik PIN di layar ini.
 * `onApprove` mengembalikan pesan galat PIN (dialog tetap terbuka) atau null (selesai).
 */
export function ApprovalDialog({ onApprove, onCancel }: { onApprove: (approval: ApprovalInput) => Promise<string | null>; onCancel: () => void }) {
  const [approvers, setApprovers] = useState<{ id: string; name: string }[] | null>(null);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    listApprovers()
      .then((result) => {
        if (!alive) return;
        if (!result.ok) return setError(result.error);
        setApprovers(result.data);
        if (result.data.length === 1) setApproverId(result.data[0].id);
      })
      .catch(() => alive && setError("Daftar penyetuju gagal dimuat. Tutup lalu coba lagi."));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!approverId) return setError("Pilih penyetuju.");
    const pinProblem = validatePin(pin);
    if (pinProblem) return setError(pinProblem);
    setError(null);
    setPending(true);
    try {
      const message = await onApprove({ approverId, pin });
      if (message) {
        setError(message);
        setPin("");
      }
    } finally {
      setPending(false);
    }
  }

  const none = approvers !== null && approvers.length === 0;
  return (
    <Dialog open onClose={() => !pending && onCancel()} fullWidth maxWidth="xs">
      <DialogTitle>Persetujuan</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Admin Keuangan atau Super Admin mengetik PIN untuk menyetujui tindakan ini.</DialogContentText>
        <Stack component="form" spacing={2} onSubmit={submit} noValidate>
          {none ? (
            <Alert severity="info">{NO_APPROVERS}</Alert>
          ) : (
            <>
              <SelectField id="approval-approver" label="Penyetuju" value={approverId} onChange={setApproverId} disabled={approvers === null}>
                <option value="">Pilih penyetuju</option>
                {(approvers ?? []).map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="approval-pin"
                label="PIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6, autoComplete: "off" } }}
                fullWidth
              />
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="button" variant="contained" onClick={() => void submit()} disabled={pending || approvers === null || none}>
          Setujui
        </Button>
      </DialogActions>
    </Dialog>
  );
}
