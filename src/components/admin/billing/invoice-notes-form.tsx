"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { INVOICE_NOTES_MAX } from "@/lib/invoice";
import { updateInvoiceNotes } from "@/server/invoice-notes";
import { SectionCard } from "../page-layout";

/** Catatan internal tagihan (spec perbaikan tagihan 6). */
export function InvoiceNotesForm({ invoiceId, notes, canEdit }: { invoiceId: string; notes: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateInvoiceNotes({ invoiceId, notes: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Catatan disimpan.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard title="Catatan tagihan" description="Hanya terlihat staf; tidak ikut struk.">
      {canEdit ? (
        <Stack spacing={1.5}>
          <TextField
            id="invoice-notes"
            label="Catatan internal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            helperText={`${value.trim().length}/${INVOICE_NOTES_MAX}`}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Box>
            <Button type="button" variant="outlined" disabled={pending || value.trim() === (notes ?? "")} onClick={save}>
              Simpan catatan
            </Button>
          </Box>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: "pre-line", color: notes ? "text.primary" : "text.secondary" }}>
          {notes ?? "Belum ada catatan."}
        </Typography>
      )}
    </SectionCard>
  );
}
