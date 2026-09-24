"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateServicePrice } from "@/server/service-admin";

type ServicePriceFormProps = {
  service: { id: string; name: string; normalPrice: number | null; promoPrice: number };
};

export function ServicePriceForm({ service }: ServicePriceFormProps) {
  const [normalPrice, setNormalPrice] = useState(service.normalPrice?.toString() ?? "");
  const [promoPrice, setPromoPrice] = useState(service.promoPrice.toString());
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await updateServicePrice({
          id: service.id,
          normalPrice: normalPrice === "" ? null : Number(normalPrice),
          promoPrice: Number(promoPrice),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`Harga ${service.name} tersimpan.`);
      } catch {
        toast.error("Harga gagal disimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <span className="min-w-48 flex-1 text-sm font-medium">{service.name}</span>

      <div className="space-y-1">
        <Label htmlFor={`normal-${service.id}`} className="text-xs">
          Harga coret
        </Label>
        <Input
          id={`normal-${service.id}`}
          inputMode="numeric"
          className="w-32"
          placeholder="kosong"
          value={normalPrice}
          onChange={(e) => setNormalPrice(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`promo-${service.id}`} className="text-xs">
          Harga berlaku
        </Label>
        <Input
          id={`promo-${service.id}`}
          inputMode="numeric"
          className="w-32"
          value={promoPrice}
          onChange={(e) => setPromoPrice(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={pending} size="sm">
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </div>
  );
}
