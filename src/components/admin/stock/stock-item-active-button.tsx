"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setStockItemActive } from "@/server/stock-catalog";

/** Barang dinonaktifkan, tidak dihapus (spec stok 5.1). */
export function StockItemActiveButton({ itemId, active }: { itemId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await setStockItemActive(itemId, !active);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(active ? "Barang dinonaktifkan." : "Barang diaktifkan kembali.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={toggle} disabled={pending}>
      {active ? "Nonaktifkan" : "Aktifkan kembali"}
    </Button>
  );
}
