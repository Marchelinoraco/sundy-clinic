"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import type { RescheduleTarget } from "@/lib/booking-actions";
import { REMINDER_REPLIES, REMINDER_REPLY_LABEL } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "@/lib/time";
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

function WorkBox({
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
    <Box
      component="section"
      aria-labelledby={id}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderRadius: 2,
        border: 1,
        p: 2,
        ...(tone === "warn"
          ? { borderColor: "warning.main", bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.06)" }
          : { borderColor: "divider", bgcolor: "background.paper" }),
      }}
    >
      <Typography component="h3" id={id} sx={{ fontWeight: 500 }}>
        {title} ({count})
      </Typography>
      {count === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Tidak ada.
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

function Who({ row, children }: { row: ReminderRow; children?: ReactNode }) {
  return (
    <Box sx={{ fontSize: "0.875rem" }}>
      <Box component="span" sx={{ fontWeight: 500 }}>
        {row.patientName}
      </Box>{" "}
      <Box component="span" sx={{ color: "text.secondary" }}>
        · {row.code} · {row.onlineLabel ?? schedule(row.startAt)} · {row.staffName}
      </Box>
      {children}
    </Box>
  );
}

const ITEM = { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, py: 1 } as const;
const NOTE = { ml: 0.5, fontSize: "0.75rem", color: "text.secondary" } as const;

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
    <Stack spacing={3}>
      <Typography component="h2" sx={{ fontSize: "1.125rem", fontWeight: 500 }}>
        Pengingat · {formatIndonesianDate(combineWitaDateAndMinutes(worklist.today, 12 * 60))}
      </Typography>

      <WorkBox id="pengingat-konfirmasi" title="1 · Konfirmasi belum dikirim" count={worklist.confirm.length} tone="warn">
        {worklist.confirm.map((row) => (
          <Box component="li" key={row.appointmentId} sx={ITEM}>
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
          </Box>
        ))}
      </WorkBox>

      <WorkBox id="pengingat-ingatkan" title="2 · Ingatkan sekarang" count={worklist.remind.length}>
        {worklist.remind.map((row) => (
          <Box component="li" key={row.appointmentId} sx={ITEM}>
            <Who row={row}>
              {row.overdue && (
                <Box component="span" data-tone="error" sx={{ ml: 0.5, fontSize: "0.75rem", fontWeight: 600, color: "error.main" }}>
                  terlambat
                </Box>
              )}
              {!row.overdue && row.shifted && (
                <Box component="span" sx={NOTE}>
                  Hari sebelumnya tutup — diingatkan hari ini
                </Box>
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
          </Box>
        ))}
      </WorkBox>

      <WorkBox id="pengingat-balasan" title="3 · Sudah diingatkan — catat balasannya" count={worklist.reminded.length}>
        {worklist.reminded.map((row) => {
          const sent = row.reminderSent!;
          const showButtons = sent.reply === null || editing === sent.messageId;
          return (
            <Box component="li" key={row.appointmentId} sx={ITEM}>
              <Who row={row}>
                <Box component="span" sx={NOTE}>
                  · diingatkan {sentWhen(sent.sentAt)} oleh {sent.sentByName}
                </Box>
              </Who>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                {showButtons ? (
                  REMINDER_REPLIES.map((reply) => (
                    <Button
                      key={reply}
                      type="button"
                      size="small"
                      variant="outlined"
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
                    <Box component="span" sx={{ fontSize: "0.875rem", fontWeight: 500, color: "success.main" }}>
                      ✓ {REMINDER_REPLY_LABEL[sent.reply!]}
                    </Box>
                    <Button type="button" size="small" variant="text" sx={{ textDecoration: "underline" }} onClick={() => setEditing(sent.messageId)}>
                      ubah
                    </Button>
                  </>
                )}
                {sent.reply === "MINTA_PINDAH" && row.channel === "KLINIK" && (
                  <Button type="button" size="small" variant="contained" onClick={() => setReschedule(row.reschedule)}>
                    Pindah jadwal
                  </Button>
                )}
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  disabled={pending}
                  onClick={() =>
                    run(() => revokeAppointmentMessage(sent.messageId), `Tanda pengingat ${row.patientName} dibatalkan.`)
                  }
                >
                  Batalkan tanda
                </Button>
              </Stack>
            </Box>
          );
        })}
      </WorkBox>

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
    </Stack>
  );
}
