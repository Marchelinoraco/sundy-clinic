"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import type { RescheduleTarget } from "@/lib/booking-actions";
import { REMINDER_REPLIES, REMINDER_REPLY_LABEL } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { recordReminderReply, revokeAppointmentMessage } from "@/server/appointment-message";
import type { ReminderRow, ReminderWorklist } from "@/server/reminder";
import { MessageActions } from "./message-actions";
import { RescheduleDialog } from "./reschedule-dialog";

function time(date: Date): string {
  return minutesToTimeLabel(witaMinutesOfDay(date));
}

function schedule(date: Date): string {
  return `${formatShortIndonesianDate(date)} ${time(date)}`;
}

function Box({
  id,
  title,
  count,
  tone = "plain",
  children,
}: {
  id: string;
  title: string;
  count: number;
  tone?: "warn" | "plain";
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("space-y-2 rounded-lg border p-4", tone === "warn" ? "border-amber-300 bg-amber-50/60" : "bg-card")}
    >
      <h3 id={id} className="font-medium">
        {title} ({count})
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">Tidak ada.</p> : <ul className="divide-y">{children}</ul>}
    </section>
  );
}

function Who({ row, children }: { row: ReminderRow; children?: ReactNode }) {
  return (
    <div className="text-sm">
      <span className="font-medium">{row.patientName}</span>{" "}
      <span className="text-muted-foreground">
        · {row.code} · {row.onlineLabel ?? schedule(row.startAt)} · {row.staffName}
      </span>
      {children}
    </div>
  );
}

/** Daftar kerja halaman Pengingat (spec C2 bagian 4, tata letak A). */
export function ReminderWorklistView({ worklist }: { worklist: ReminderWorklist }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<RescheduleTarget | null>(null);

  const sentWhen = (date: Date) => (witaDateString(date) === worklist.today ? time(date) : schedule(date));

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        setEditing(null);
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">
        Pengingat · {formatIndonesianDate(combineWitaDateAndMinutes(worklist.today, 12 * 60))}
      </h2>

      <Box id="pengingat-konfirmasi" title="1 · Konfirmasi belum dikirim" count={worklist.confirm.length} tone="warn">
        {worklist.confirm.map((row) => (
          <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Who row={row} />
            {row.confirmation && (
              <MessageActions
                appointmentId={row.appointmentId}
                kind="KONFIRMASI"
                message={row.confirmation}
                scheduledFor={row.startAt}
                sendLabel="Kirim konfirmasi"
                layout="inline"
              />
            )}
          </li>
        ))}
      </Box>

      <Box id="pengingat-ingatkan" title="2 · Ingatkan sekarang" count={worklist.remind.length}>
        {worklist.remind.map((row) => (
          <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Who row={row}>
              {row.overdue && <span className="ml-1 text-xs font-semibold text-destructive">terlambat</span>}
              {!row.overdue && row.shifted && (
                <span className="ml-1 text-xs text-muted-foreground">Hari sebelumnya tutup — diingatkan hari ini</span>
              )}
            </Who>
            {row.reminder && (
              <MessageActions
                appointmentId={row.appointmentId}
                kind="PENGINGAT"
                message={row.reminder}
                scheduledFor={row.startAt}
                sendLabel="Ingatkan via WA"
                layout="inline"
              />
            )}
          </li>
        ))}
      </Box>

      <Box id="pengingat-balasan" title="3 · Sudah diingatkan — catat balasannya" count={worklist.reminded.length}>
        {worklist.reminded.map((row) => {
          const sent = row.reminderSent!;
          const showButtons = sent.reply === null || editing === sent.messageId;
          return (
            <li key={row.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Who row={row}>
                <span className="ml-1 text-xs text-muted-foreground">
                  · diingatkan {sentWhen(sent.sentAt)} oleh {sent.sentByName}
                </span>
              </Who>
              <div className="flex flex-wrap items-center gap-1">
                {showButtons ? (
                  REMINDER_REPLIES.map((reply) => (
                    <Button
                      key={reply}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => recordReminderReply({ messageId: sent.messageId, reply }),
                          `${row.patientName}: ${REMINDER_REPLY_LABEL[reply]}.`,
                        )
                      }
                    >
                      {REMINDER_REPLY_LABEL[reply]}
                    </Button>
                  ))
                ) : (
                  <>
                    <span className="text-sm font-medium text-emerald-700">
                      ✓ {REMINDER_REPLY_LABEL[sent.reply!]}
                    </span>
                    <Button type="button" size="sm" variant="link" onClick={() => setEditing(sent.messageId)}>
                      ubah
                    </Button>
                  </>
                )}
                {sent.reply === "MINTA_PINDAH" && row.channel === "KLINIK" && (
                  <Button type="button" size="sm" onClick={() => setReschedule(row.reschedule)}>
                    Pindah jadwal
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() => revokeAppointmentMessage(sent.messageId), `Tanda pengingat ${row.patientName} dibatalkan.`)
                  }
                >
                  Batalkan tanda
                </Button>
              </div>
            </li>
          );
        })}
      </Box>

      {reschedule && (
        <RescheduleDialog
          key={reschedule.appointmentId}
          target={reschedule}
          today={worklist.today}
          open
          onOpenChange={(open) => {
            if (!open) setReschedule(null);
          }}
        />
      )}
    </div>
  );
}
