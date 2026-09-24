"use client";

import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPOINTMENT_STATUSES, STATUS_LABEL } from "@/lib/appointment-status";

const ALL = "semua";

type Props = {
  date: string;
  status: string | null;
  staffId: string | null;
  branchId: string | null;
  staff: { id: string; name: string }[];
  branches: { id: string; name: string }[];
};

export function BookingFilters({ date, status, staffId, branchId, staff, branches }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string | null) {
    const params = new URLSearchParams({ tanggal: date });
    if (status) params.set("status", status);
    if (staffId) params.set("staf", staffId);
    if (branchId) params.set("cabang", branchId);
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="filter-date" className="text-xs">
          Tanggal
        </Label>
        <Input
          id="filter-date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && update("tanggal", e.target.value)}
          className="w-44"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-status" className="text-xs">
          Status
        </Label>
        <Select value={status ?? ALL} onValueChange={(v) => update("status", v)}>
          <SelectTrigger id="filter-status" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            {APPOINTMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {staff.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="filter-staff" className="text-xs">
            Tenaga
          </Label>
          <Select value={staffId ?? ALL} onValueChange={(v) => update("staf", v)}>
            <SelectTrigger id="filter-staff" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua tenaga</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {branches.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="filter-branch" className="text-xs">
            Cabang
          </Label>
          <Select value={branchId ?? ALL} onValueChange={(v) => update("cabang", v)}>
            <SelectTrigger id="filter-branch" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua cabang</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
