"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { updateOnlineService, type OnlineServiceSettings } from "@/server/service-admin";
import { SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

const DURATIONS = [15, 30, 45, 60];

/** Konsultasi Online tidak ada di katalog layanan, jadi diatur di kartu sendiri (spec 3.3). */
export function OnlineServiceCard({ settings }: { settings: OnlineServiceSettings }) {
  const router = useRouter();
  const [price, setPrice] = useState<number | null>(settings.price || null);
  const [durationMin, setDurationMin] = useState(settings.durationMin);
  const [active, setActive] = useState(settings.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOnlineService({ price: price ?? 0, durationMin, active });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengaturan Konsultasi Online tersimpan.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Konsultasi Online"
      description="Konsultasi lewat WhatsApp tanpa slot jadwal. Customer membayar biaya booking ditambah harga ini di muka."
    >
      <div className="space-y-4 text-sm">
        <p>
          Status: <strong>{settings.active ? `Aktif · ${formatRupiah(settings.price)}` : "Belum aktif"}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="online-price">Harga</Label>
            <RupiahInput id="online-price" aria-label="Harga Konsultasi Online" value={price} onChange={setPrice} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="online-duration">Durasi</Label>
            <select
              id="online-duration"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} menit
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Aktifkan konsultasi online
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="button" onClick={save} disabled={pending}>
          Simpan
        </Button>
      </div>
    </SectionCard>
  );
}
