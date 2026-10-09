"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { toast } from "sonner";
import type { Credentials } from "@/server/staff";

/**
 * Kata sandi sementara yang tampil sekali (spec kelola staf 5.2). Hanya hidup di state pemanggil: menutup dialog membuangnya.
 * Klik di luar dialog dan tombol Esc tidak menutupnya, supaya kata sandi tidak hilang sebelum sempat disalin. Untuk reset akun
 * sendiri (`requireConfirm`), sesi pemilik sudah dicabut: menutup dialog tanpa menyimpan kata sandi mengunci pemilik tunggal dari
 * panel, jadi Tutup baru aktif setelah ia menyatakan sudah menyimpannya.
 */
export function TempPasswordDialog({
  name,
  credentials,
  requireConfirm = false,
  onClose,
}: {
  name: string;
  credentials: Credentials;
  requireConfirm?: boolean;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      toast.success("Kata sandi disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <Dialog open onClose={(_, reason) => reason !== "backdropClick" && reason !== "escapeKeyDown" && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Kata sandi sementara — {name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Email login
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>{credentials.email}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Kata sandi sementara
            </Typography>
            <Box
              data-testid="kata-sandi-sementara"
              sx={{ fontFamily: "ui-monospace, monospace", fontSize: "1.25rem", letterSpacing: "0.05em", userSelect: "all", overflowWrap: "anywhere" }}
            >
              {credentials.tempPassword}
            </Box>
          </Box>
          <Box>
            <Button variant="outlined" onClick={() => void copy()}>
              Salin kata sandi
            </Button>
          </Box>
          <Alert severity="warning">Kata sandi ini hanya tampil sekali. Sampaikan ke staf; ia wajib menggantinya saat masuk pertama.</Alert>
          {requireConfirm && (
            <FormControlLabel control={<Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} />} label="Saya sudah menyimpan kata sandi ini" />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" disabled={requireConfirm && !saved} onClick={onClose}>
          Tutup
        </Button>
      </DialogActions>
    </Dialog>
  );
}
