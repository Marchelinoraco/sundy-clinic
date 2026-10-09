"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setSupplierActive } from "@/server/stock-catalog";

export function SupplierActiveButton({ supplierId, name, active }: { supplierId: string; name: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await setSupplierActive(supplierId, !active);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(active ? `${name} dinonaktifkan.` : `${name} diaktifkan kembali.`);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Button type="button" size="small" variant="text" onClick={toggle} disabled={pending} aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${name}`}>
      {active ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}
