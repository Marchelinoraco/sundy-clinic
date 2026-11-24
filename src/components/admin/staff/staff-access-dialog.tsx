"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CAPABILITY_LABEL, GRANTABLE_CAPABILITIES, can, type Capability } from "@/lib/permissions";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import type { StaffRow } from "@/server/staff";
import { setStaffExtraCapabilities } from "@/server/staff-access";

/** Super Admin mencentang akses tambahan di luar peran dasar satu akun (spec akses tambahan bagian 6). */
export function StaffAccessDialog({ row, onClose }: { row: StaffRow; onClose: () => void }) {
  const router = useRouter();
  const [extra, setExtra] = useState<ReadonlySet<Capability>>(() => new Set(row.extraCapabilities));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = `Akses tambahan — ${row.name}`;
  const roleLabel = STAFF_ROLE_LABEL[row.role];

  function toggle(capability: Capability, checked: boolean) {
    setExtra((prev) => {
      const next = new Set(prev);
      if (checked) next.add(capability);
      else next.delete(capability);
      return next;
    });
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      const chosen = GRANTABLE_CAPABILITIES.filter((c) => !can(row.role, c) && extra.has(c));
      const result = await setStaffExtraCapabilities(row.id, chosen);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Akses tambahan disimpan.");
      router.refresh();
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="xs" aria-label={title}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Peran dasar: {roleLabel}
          </Typography>
          <Typography component="h3" variant="subtitle2">
            Stok
          </Typography>
          <FormGroup>
            {GRANTABLE_CAPABILITIES.map((capability) => {
              const fromRole = can(row.role, capability);
              return (
                <FormControlLabel
                  key={capability}
                  control={<Checkbox checked={fromRole || extra.has(capability)} disabled={fromRole || pending} onChange={(event) => toggle(capability, event.target.checked)} />}
                  label={
                    <>
                      {CAPABILITY_LABEL[capability]}
                      {fromRole && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          dari peran {roleLabel}
                        </Typography>
                      )}
                    </>
                  }
                />
              );
            })}
          </FormGroup>
          <Typography variant="caption" color="text.secondary">
            Mencentang satu fitur otomatis memberi akses melihat stok.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Batal
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={pending}>
          Simpan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
