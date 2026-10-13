"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isMonthString } from "@/lib/expense";
import { MonthField } from "../mui/date-field";

/** Buka (atau siapkan) penggajian satu bulan. */
export function PayrollMonthPicker({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <MonthField id="payroll-month" label="Bulan" value={month} onChange={setMonth} />
      <Button type="button" variant="contained" disabled={!isMonthString(month)} onClick={() => router.push(`/admin/karyawan/penggajian/${month}`)}>
        Buka
      </Button>
    </Stack>
  );
}
