"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PUBLIC_MAX_DAYS_AHEAD } from "@/lib/booking-rules";
import { addDaysToDateString, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
import { branchNotifyMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { getPublicSlots, holdSlot, type PublicSlot } from "@/server/public-booking";
import type { BookingOptions, PublicService } from "@/server/public-booking-data";

export type HeldSlot = {
  token: string;
  expiresAt: string;
  startAt: string;
  staffId: string;
  staffName: string;
  label: string;
};

export type ScheduleDraft = {
  branchId: string | null;
  /** null = "siapa saja yang tersedia". */
  staffId: string | null;
  date: string | null;
  hold: HeldSlot | null;
};

type SlotsState = { key: string; slots: PublicSlot[]; error: string | null };

export function ScheduleStep({
  options,
  service,
  value,
  onChange,
}: {
  options: BookingOptions;
  service: PublicService;
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
}) {
  const activeBranches = options.branches.filter((b) => b.status === "AKTIF");
  // Selama hanya satu cabang aktif, cabang dipilih otomatis (PRD F5).
  const branchId = value.branchId ?? (activeBranches.length === 1 ? activeBranches[0].id : null);
  const staffChoices = options.staff.filter(
    (s) => branchId !== null && s.branchIds.includes(branchId) && (!service.requiresDoctor || s.role === "DOKTER"),
  );
  const today = witaDateString(new Date());
  const staffSelectId = useId();
  const dateId = useId();
  const [refresh, setRefresh] = useState(0);
  const [slotsState, setSlotsState] = useState<SlotsState>({ key: "", slots: [], error: null });
  const [holding, startHolding] = useTransition();

  const holdToken = value.hold?.token ?? null;
  const requestKey = branchId && value.date ? `${service.id}|${branchId}|${value.staffId ?? "*"}|${value.date}|${refresh}` : "";

  useEffect(() => {
    if (!requestKey || !branchId || !value.date) return;
    let cancelled = false;
    getPublicSlots({ serviceId: service.id, staffId: value.staffId, branchId, date: value.date, holdToken })
      .then((result) => {
        if (cancelled) return;
        setSlotsState({ key: requestKey, slots: result.ok ? result.data : [], error: result.ok ? null : result.error });
      })
      .catch(() => {
        if (!cancelled) setSlotsState({ key: requestKey, slots: [], error: "Gagal memuat jam. Coba lagi." });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, branchId, service.id, value.staffId, value.date, holdToken]);

  function select(slot: PublicSlot) {
    if (!branchId) return;
    startHolding(async () => {
      try {
        const result = await holdSlot({
          serviceId: service.id,
          staffId: slot.staffId,
          branchId,
          startAt: slot.startAt.toISOString(),
          previousToken: holdToken,
        });
        if (!result.ok) {
          toast.error(result.error);
          setRefresh((n) => n + 1);
          return;
        }
        onChange({
          ...value,
          branchId,
          hold: {
            token: result.data.token,
            expiresAt: result.data.expiresAt.toISOString(),
            startAt: slot.startAt.toISOString(),
            staffId: slot.staffId,
            staffName: slot.staffName,
            label: slot.label,
          },
        });
      } catch {
        toast.error("Gagal menahan jam. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {options.branches.length > 1 && (
        <div role="radiogroup" aria-label="Cabang" className="space-y-2">
          {options.branches.map((branch) =>
            branch.status === "AKTIF" ? (
              <button
                key={branch.id}
                type="button"
                role="radio"
                aria-checked={branch.id === branchId}
                onClick={() => onChange({ ...value, branchId: branch.id, staffId: null, hold: null })}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left",
                  branch.id === branchId ? "border-gold-500 bg-cream-100 font-semibold" : "border-cream-300 bg-white",
                )}
              >
                {branch.name}
              </button>
            ) : (
              <div key={branch.id} className="rounded-2xl border border-cream-300 bg-cream-100 px-4 py-3 text-brown-500">
                {branch.name} · <span className="font-semibold">Segera Hadir</span>{" "}
                <a
                  href={buildWhatsAppLink(branchNotifyMessage(branch.name))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  Beri tahu saya saat buka
                </a>
              </div>
            ),
          )}
        </div>
      )}

      {staffChoices.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor={staffSelectId}>Dengan</Label>
          <select
            id={staffSelectId}
            value={value.staffId ?? ""}
            onChange={(e) => onChange({ ...value, branchId, staffId: e.target.value || null, hold: null })}
            className="w-full rounded-lg border border-cream-300 bg-white px-3 py-2"
          >
            <option value="">Siapa saja yang tersedia</option>
            {staffChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {staffChoices.length === 1 && <p className="text-sm text-brown-700">Dengan {staffChoices[0].name}</p>}

      <div className="space-y-1">
        <Label htmlFor={dateId}>Tanggal</Label>
        <Input
          id={dateId}
          type="date"
          min={today}
          max={addDaysToDateString(today, PUBLIC_MAX_DAYS_AHEAD)}
          value={value.date ?? ""}
          onChange={(e) => onChange({ ...value, branchId, date: e.target.value || null, hold: null })}
        />
      </div>

      {!value.date ? (
        <p className="text-sm text-brown-600">Pilih tanggal untuk melihat jam yang kosong.</p>
      ) : slotsState.key !== requestKey ? (
        <p className="text-sm text-brown-600">Memuat jam…</p>
      ) : slotsState.error ? (
        <p className="text-sm text-destructive">{slotsState.error}</p>
      ) : slotsState.slots.length === 0 ? (
        <p className="text-sm text-brown-600">
          Tidak ada jam kosong pada tanggal ini — hari libur, di luar jadwal, atau sudah penuh. Coba tanggal lain.
        </p>
      ) : (
        <div role="group" aria-label="Pilih jam" className="flex flex-wrap gap-2">
          {slotsState.slots.map((slot) => {
            const selected = value.hold?.startAt === slot.startAt.toISOString();
            return (
              <Button
                key={`${slot.staffId}-${slot.startAt.toISOString()}`}
                type="button"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                disabled={holding}
                onClick={() => select(slot)}
              >
                {slot.label}
              </Button>
            );
          })}
        </div>
      )}

      {value.hold && (
        <p className="rounded-xl bg-cream-100 p-3 text-sm text-brown-800">
          Jam {value.hold.label} bersama {value.hold.staffName} ditahan untuk Anda sampai pukul{" "}
          {minutesToTimeLabel(witaMinutesOfDay(new Date(value.hold.expiresAt)))} WITA.
        </p>
      )}
    </div>
  );
}
