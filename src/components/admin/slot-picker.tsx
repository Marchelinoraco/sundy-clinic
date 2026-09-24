"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SlotOption } from "@/lib/slot";
import { getStaffAvailabilityForAdmin } from "@/server/schedule";

type Props = {
  staffId: string;
  branchId: string;
  date: string;
  durationMinutes: number;
  selected: SlotOption | null;
  onSelect: (slot: SlotOption) => void;
  /** Dinaikkan oleh form untuk memaksa muat ulang, misal setelah slot direbut booking lain. */
  refreshKey: number;
};

type LoadState = { key: string; slots: SlotOption[]; failed: boolean };

export function SlotPicker({
  staffId,
  branchId,
  date,
  durationMinutes,
  selected,
  onSelect,
  refreshKey,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${date}|${durationMinutes}|${refreshKey}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", slots: [], failed: false });
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityForAdmin({ staffId, branchId, date, durationMinutes })
      .then((slots) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots: [], failed: true });
      });
  }, [requestKey, staffId, branchId, date, durationMinutes]);

  if (loaded.key !== requestKey) {
    return <p className="text-sm text-muted-foreground">Memuat slot…</p>;
  }
  if (loaded.failed) {
    return <p className="text-sm text-destructive">Gagal memuat slot. Coba pilih tanggal lagi.</p>;
  }
  if (loaded.slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tidak ada slot kosong pada tanggal ini — hari libur, di luar jadwal tenaga ini, atau sudah
        penuh.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih jam">
      {loaded.slots.map((slot) => {
        const isSelected = selected?.startAt.getTime() === slot.startAt.getTime();
        return (
          <Button
            key={slot.startAt.toISOString()}
            type="button"
            size="sm"
            variant={isSelected ? "default" : "outline"}
            aria-pressed={isSelected}
            onClick={() => onSelect(slot)}
          >
            {slot.label}
          </Button>
        );
      })}
    </div>
  );
}
