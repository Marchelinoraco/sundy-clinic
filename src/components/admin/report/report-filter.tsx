"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Form from "next/form";
import { useState } from "react";
import { REPORT_PRESET_LABEL, REPORT_PRESETS, type ReportPeriod, type ReportPreset } from "@/lib/report";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";

/**
 * Pilihan periode dan cabang (spec laporan 7). Tanggal "dari" dan "sampai" dipakai bila periode = Rentang bebas;
 * mengubah salah satu tanggal otomatis memilih Rentang bebas, supaya tanggal yang diketik tidak diabaikan.
 */
export function ReportFilter({
  preset: initialPreset,
  period,
  branchId,
  branches,
}: {
  preset: ReportPreset;
  period: ReportPeriod;
  branchId: string | null;
  branches: { id: string; name: string }[];
}) {
  const [preset, setPreset] = useState<ReportPreset>(initialPreset);
  return (
    <Form action="/admin/laporan">
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <SelectField name="periode" label="Periode" value={preset} onChange={(value) => setPreset(value as ReportPreset)} fullWidth={false} sx={{ minWidth: 180 }}>
          {REPORT_PRESETS.map((value) => (
            <option key={value} value={value}>
              {REPORT_PRESET_LABEL[value]}
            </option>
          ))}
        </SelectField>
        <DateField name="dari" label="Dari tanggal" defaultValue={period.from} onChange={() => setPreset("RENTANG")} sx={{ width: 180 }} />
        <DateField name="sampai" label="Sampai tanggal" defaultValue={period.to} onChange={() => setPreset("RENTANG")} sx={{ width: 180 }} />
        <SelectField name="cabang" label="Cabang" defaultValue={branchId ?? ""} fullWidth={false} sx={{ minWidth: 180 }}>
          <option value="">Semua cabang</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outlined" sx={{ height: 40 }}>
          Tampilkan
        </Button>
      </Stack>
    </Form>
  );
}
