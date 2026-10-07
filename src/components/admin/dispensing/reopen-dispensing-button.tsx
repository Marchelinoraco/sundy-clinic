"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reopenDispensing } from "@/server/dispensing-lifecycle";
import { useDispensingAction } from "./use-dispensing-action";

/** Buka kembali penyerahan (spec penyerahan 4.5); baris asal penyerahan di draf tagihan dicabut. */
export function ReopenDispensingButton({ dispensingId }: { dispensingId: string }) {
  const { run, error, pending } = useDispensingAction();
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => reopenDispensing({ dispensingId }), () => toast.success("Penyerahan dibuka kembali."))}>
        Buka kembali
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
