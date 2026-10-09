"use client";

import { usePathname, useRouter } from "next/navigation";
import Stack from "@mui/material/Stack";
import { APPOINTMENT_STATUSES, STATUS_LABEL } from "@/lib/appointment-status";
import { DateField } from "./mui/date-field";
import { SelectField } from "./mui/select-field";

const ALL = "semua";

type Props = {
  date: string;
  status: string | null;
  staffId: string | null;
  branchId: string | null;
  intake: string | null;
  staff: { id: string; name: string }[];
  branches: { id: string; name: string }[];
};

export function BookingFilters({ date, status, staffId, branchId, intake, staff, branches }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string | null) {
    const params = new URLSearchParams({ tanggal: date });
    if (status) params.set("status", status);
    if (staffId) params.set("staf", staffId);
    if (branchId) params.set("cabang", branchId);
    if (intake) params.set("isian", intake);
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
      <DateField id="filter-date" label="Tanggal" value={date} onChange={(value) => value && update("tanggal", value)} sx={{ width: 180 }} />
      <SelectField id="filter-status" label="Status" value={status ?? ALL} onChange={(value) => update("status", value)} fullWidth={false} sx={{ minWidth: 192 }}>
        <option value={ALL}>Semua status</option>
        {APPOINTMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </SelectField>
      <SelectField id="filter-intake" label="Isian" value={intake ?? ALL} onChange={(value) => update("isian", value)} fullWidth={false} sx={{ minWidth: 192 }}>
        <option value={ALL}>Semua isian</option>
        <option value="belum-diperiksa">Belum diperiksa</option>
      </SelectField>
      {staff.length > 1 && (
        <SelectField id="filter-staff" label="Tenaga" value={staffId ?? ALL} onChange={(value) => update("staf", value)} fullWidth={false} sx={{ minWidth: 224 }}>
          <option value={ALL}>Semua tenaga</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      {branches.length > 1 && (
        <SelectField id="filter-branch" label="Cabang" value={branchId ?? ALL} onChange={(value) => update("cabang", value)} fullWidth={false} sx={{ minWidth: 192 }}>
          <option value={ALL}>Semua cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      )}
    </Stack>
  );
}
