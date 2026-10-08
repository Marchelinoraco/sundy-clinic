"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes } from "@/lib/time";
import type { DayAvailability } from "@/server/availability";
import { getStaffAvailabilityRange } from "@/server/schedule";
import { DateField } from "./mui/date-field";

export const STRIP_DAYS = 14;

type Props = {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  /** Tanggal terpilih ("YYYY-MM-DD"), atau "" bila belum ada. */
  selected: string;
  onSelect: (date: string) => void;
  /** Dinaikkan oleh form untuk memaksa muat ulang, misal setelah jam direbut booking lain. */
  refreshKey: number;
  /** Pindah jadwal: jam milik booking ini tidak dihitung terisi. */
  excludeAppointmentId?: string;
};

type LoadState = { key: string; days: DayAvailability[]; failed: boolean };

function stateLabel(day: DayAvailability): string {
  if (day.state === "CLOSED") return "tutup";
  if (day.state === "FULL") return "penuh";
  return `${day.openCount} jam`;
}

/** Tengah hari WITA, agar label tanggal tidak bergeser ke hari lain. */
function noon(date: string): Date {
  return combineWitaDateAndMinutes(date, 12 * 60);
}

/** Strip 14 hari mulai hari ini, dan isian untuk tanggal di luarnya (spec C1 bagian 3). */
export function DateStrip({
  staffId,
  branchId,
  durationMinutes,
  today,
  selected,
  onSelect,
  refreshKey,
  excludeAppointmentId,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${durationMinutes}|${today}|${refreshKey}|${excludeAppointmentId ?? ""}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", days: [], failed: false });
  const [showOtherDate, setShowOtherDate] = useState(false);
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityRange({
      staffId,
      branchId,
      durationMinutes,
      from: today,
      days: STRIP_DAYS,
      ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
    })
      .then((days) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days: [], failed: true });
      });
  }, [requestKey, staffId, branchId, durationMinutes, today, excludeAppointmentId]);

  const ready = loaded.key === requestKey;
  const inStrip = loaded.days.some((day) => day.date === selected);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {!ready ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Memuat tanggal…
        </Typography>
      ) : loaded.failed ? (
        <Typography variant="body2" sx={{ color: "error.main" }}>
          Gagal memuat tanggal. Gunakan Pilih tanggal lain.
        </Typography>
      ) : (
        <>
          <Box role="group" aria-label="Pilih tanggal" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {loaded.days.map((day) => {
              const open = day.state === "OPEN";
              const isSelected = day.date === selected;
              return (
                <ButtonBase
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  disabled={!open}
                  aria-pressed={isSelected}
                  aria-label={`${formatIndonesianDate(noon(day.date))} — ${open ? `${day.openCount} jam kosong` : stateLabel(day)}`}
                  onClick={() => onSelect(day.date)}
                  sx={{
                    width: 76,
                    flexDirection: "column",
                    borderRadius: 2,
                    border: 1,
                    px: 0.5,
                    py: 1,
                    fontSize: "0.75rem",
                    ...(isSelected
                      ? { borderColor: "primary.main", bgcolor: "primary.main", color: "primary.contrastText" }
                      : open
                        ? { borderColor: "divider", bgcolor: "background.paper", "&:hover": { bgcolor: "action.hover" } }
                        : { borderColor: "divider", bgcolor: "action.hover", color: "text.secondary" }),
                  }}
                >
                  <span>{formatShortIndonesianDate(noon(day.date))}</span>
                  <Box component="span" sx={{ mt: 0.5, fontWeight: 500 }}>
                    {stateLabel(day)}
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          {loaded.days.every((day) => day.state === "CLOSED") && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Tidak ada jadwal dalam {STRIP_DAYS} hari ke depan — gunakan Pilih tanggal lain.
            </Typography>
          )}
        </>
      )}

      {showOtherDate ? (
        <DateField
          id="booking-date-other"
          label="Tanggal lain"
          min={today}
          value={inStrip ? "" : selected}
          onChange={(value) => value && onSelect(value)}
          sx={{ width: 200 }}
        />
      ) : (
        <Button type="button" variant="text" sx={{ alignSelf: "flex-start", px: 0, minWidth: 0, textDecoration: "underline" }} onClick={() => setShowOtherDate(true)}>
          Pilih tanggal lain
        </Button>
      )}
    </Box>
  );
}
