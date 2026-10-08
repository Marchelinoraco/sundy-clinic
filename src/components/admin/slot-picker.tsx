"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
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
  /** Pindah jadwal: jam milik booking ini tidak dihitung terisi. */
  excludeAppointmentId?: string;
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
  excludeAppointmentId,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${date}|${durationMinutes}|${refreshKey}|${excludeAppointmentId ?? ""}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", slots: [], failed: false });
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityForAdmin({
      staffId,
      branchId,
      date,
      durationMinutes,
      ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
    })
      .then((slots) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, slots: [], failed: true });
      });
  }, [requestKey, staffId, branchId, date, durationMinutes, excludeAppointmentId]);

  if (loaded.key !== requestKey) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Memuat slot…
      </Typography>
    );
  }
  if (loaded.failed) {
    return (
      <Typography variant="body2" sx={{ color: "error.main" }}>
        Gagal memuat slot. Coba pilih tanggal lagi.
      </Typography>
    );
  }
  if (loaded.slots.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Tidak ada slot kosong pada tanggal ini — hari libur, di luar jadwal tenaga ini, atau sudah penuh.
      </Typography>
    );
  }

  return (
    <Box role="group" aria-label="Pilih jam" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {loaded.slots.map((slot) => {
        const isSelected = selected?.startAt.getTime() === slot.startAt.getTime();
        return (
          <Button
            key={slot.startAt.toISOString()}
            type="button"
            variant={isSelected ? "contained" : "outlined"}
            aria-pressed={isSelected}
            sx={{ minWidth: 80 }}
            onClick={() => onSelect(slot)}
          >
            {slot.label}
          </Button>
        );
      })}
    </Box>
  );
}
