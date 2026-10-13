import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { InvoiceNotesForm } from "./invoice-notes-form";

/** Draf tanpa invoice:manage: baris hanya diubah resepsionis, catatan tetap bisa diisi Admin Keuangan (spec perbaikan tagihan 6). */
export function InvoiceDraftReadOnly({ invoiceId, notes, canEditNotes }: { invoiceId: string; notes: string | null; canEditNotes: boolean }) {
  return (
    <Stack spacing={3}>
      <Typography role="status" variant="body2" sx={{ color: "text.secondary" }}>
        Tagihan ini masih draf; hanya resepsionis yang bisa mengubahnya.
      </Typography>
      <InvoiceNotesForm invoiceId={invoiceId} notes={notes} canEdit={canEditNotes} />
    </Stack>
  );
}
