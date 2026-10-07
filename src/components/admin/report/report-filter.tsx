import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REPORT_PRESET_LABEL, REPORT_PRESETS, type ReportPeriod, type ReportPreset } from "@/lib/report";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

/** Pilihan periode dan cabang (spec laporan 7). Tanggal "dari" dan "sampai" dipakai bila periode = Rentang bebas. */
export function ReportFilter({
  preset,
  period,
  branchId,
  branches,
}: {
  preset: ReportPreset;
  period: ReportPeriod;
  branchId: string | null;
  branches: { id: string; name: string }[];
}) {
  return (
    <Form action="/admin/laporan" className="flex flex-wrap items-end gap-2">
      <select name="periode" aria-label="Periode" defaultValue={preset} className={selectClass}>
        {REPORT_PRESETS.map((value) => (
          <option key={value} value={value}>
            {REPORT_PRESET_LABEL[value]}
          </option>
        ))}
      </select>
      <Input name="dari" type="date" aria-label="Dari tanggal" defaultValue={period.from} className="w-40" />
      <Input name="sampai" type="date" aria-label="Sampai tanggal" defaultValue={period.to} className="w-40" />
      <select name="cabang" aria-label="Cabang" defaultValue={branchId ?? ""} className={selectClass}>
        <option value="">Semua cabang</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline">
        Tampilkan
      </Button>
    </Form>
  );
}
