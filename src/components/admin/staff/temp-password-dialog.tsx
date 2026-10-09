"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import type { Credentials } from "@/server/staff";

/**
 * Kata sandi sementara yang tampil sekali (spec kelola staf 5.2). Hanya hidup di state pemanggil: menutup dialog membuangnya.
 * Klik di luar dialog tidak menutupnya, supaya kata sandi tidak hilang sebelum sempat disalin.
 */
export function TempPasswordDialog({ name, credentials, onClose }: { name: string; credentials: Credentials; onClose: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      toast.success("Kata sandi disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <Dialog open onClose={(_, reason) => reason !== "backdropClick" && onClose()} fullWidth maxWidth="xs">
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Tutup
        </Button>
      </DialogActions>
    </Dialog>
  );
}
