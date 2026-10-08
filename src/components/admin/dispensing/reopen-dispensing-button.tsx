"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { toast } from "sonner";
import { reopenDispensing } from "@/server/dispensing-lifecycle";
import { useDispensingAction } from "./use-dispensing-action";

/** Buka kembali penyerahan (spec penyerahan 4.5); baris asal penyerahan di draf tagihan dicabut. */
export function ReopenDispensingButton({ dispensingId }: { dispensingId: string }) {
  const { run, error, pending } = useDispensingAction();
  return (
    <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
      <Button
        type="button"
        variant="outlined"
        disabled={pending}
        onClick={() => run(() => reopenDispensing({ dispensingId }), () => toast.success("Penyerahan dibuka kembali."))}
      >
        Buka kembali
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
