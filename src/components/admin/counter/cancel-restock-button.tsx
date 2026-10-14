"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelRestockRequest } from "@/server/restock";

/** Batalkan permintaan yang masih menunggu (spec stok meja 4.1). */
export function CancelRestockButton({ requestId, version }: { requestId: string; version: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="small"
      variant="text"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await cancelRestockRequest({ requestId, version });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Permintaan dibatalkan.");
            router.refresh();
          } catch {
            toast.error("Gagal membatalkan. Coba lagi.");
          }
        })
      }
    >
      Batalkan permintaan
    </Button>
  );
}
