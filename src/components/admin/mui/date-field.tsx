"use client";

import type { SxProps, Theme } from "@mui/material/styles";
import { DesktopDatePicker } from "@mui/x-date-pickers/DesktopDatePicker";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import {
  DATE_FIELD_FORMAT,
  dateTextToDayjs,
  dayjsToDateText,
  dayjsToMonthText,
  MONTH_FIELD_FORMAT,
  monthTextToDayjs,
} from "@/lib/date-field";

export type PickerFieldProps = {
  label: string;
  id?: string;
  /** Untuk formulir GET/aksi: dikirim lewat input tersembunyi bernilai "YYYY-MM-DD"/"YYYY-MM". */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
};

const KINDS = {
  date: { toDayjs: dateTextToDayjs, toText: dayjsToDateText, format: DATE_FIELD_FORMAT, views: undefined, openTo: undefined },
  month: { toDayjs: monthTextToDayjs, toText: dayjsToMonthText, format: MONTH_FIELD_FORMAT, views: ["year", "month"] as const, openTo: "month" as const },
};

/**
 * Pemilih tanggal MUI X dengan nilai teks (spec MUI 4). Nilai pemilih disimpan di sini supaya ketikan
 * setengah jadi tidak dihapus oleh nilai "" dari induk; nilai dari luar hanya diambil bila berbeda dari
 * yang sedang tampil. Desktop picker di semua layar: bisa diketik juga di ponsel.
 */
function PickerField({ kind, label, id, name, value, defaultValue, onChange, min, max, disabled, helperText, error, fullWidth, sx }: PickerFieldProps & { kind: keyof typeof KINDS }) {
  const { toDayjs, toText, format, views, openTo } = KINDS[kind];
  const [picked, setPicked] = useState<Dayjs | null>(() => toDayjs(value ?? defaultValue ?? ""));
  const [seen, setSeen] = useState(value);
  if (value !== undefined && value !== seen) {
    setSeen(value);
    if (value !== toText(picked)) setPicked(toDayjs(value));
  }

  function handleChange(next: Dayjs | null) {
    const before = toText(picked);
    setPicked(next);
    const text = toText(next);
    if (text !== before) onChange?.(text);
  }

  return (
    <>
      <DesktopDatePicker
        label={label}
        value={picked}
        onChange={handleChange}
        format={format}
        views={views ? [...views] : undefined}
        openTo={openTo}
        minDate={min ? (toDayjs(min) ?? undefined) : undefined}
        maxDate={max ? (toDayjs(max) ?? undefined) : undefined}
        disabled={disabled}
        // Ukuran dan warna sama dengan TextField admin (tema: kecil, sekunder); PickersTextField tidak ikut bawaan TextField.
        slotProps={{ textField: { id, helperText, error, fullWidth, sx, size: "small", color: "secondary" } }}
      />
      {name && <input type="hidden" name={name} value={toText(picked)} />}
    </>
  );
}

export function DateField(props: PickerFieldProps) {
  return <PickerField kind="date" {...props} />;
}

export function MonthField(props: PickerFieldProps) {
  return <PickerField kind="month" {...props} />;
}
