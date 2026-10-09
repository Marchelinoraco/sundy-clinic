"use client";

import MoreHoriz from "@mui/icons-material/MoreHoriz";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { GridColDef } from "@mui/x-data-grid";
import NextLink from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { STATUS_LABEL, type AppointmentStatusValue } from "@/lib/appointment-status";
import {
  BOOKING_ACTION_LABEL,
  bookingRowActions,
  showsContactWindows,
  type BookingAction,
  type ContactWindowsTarget,
  type RescheduleTarget,
} from "@/lib/booking-actions";
import type { MessageKind } from "@/lib/booking-messages";
import type { OnlinePhase } from "@/lib/online-consultation";
import type { BookingSourceValue } from "@/lib/payment";
import {
  cancelAppointment,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { useBookingDialogs } from "./booking-dialogs";
import { MatchPatientDialog } from "./match-patient-dialog";
import { AdminDataGrid } from "./mui/admin-data-grid";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";
import { recordSentMessage, WhatsAppSendButton } from "./whatsapp-send-button";

/** Keterangan baris booking online; rentang dan percobaan tanpa data klinis. */
export type OnlineRowInfo = {
  windowLines: string[];
  /** Hanya untuk booking terkonfirmasi; null selain itu. */
  phase: OnlinePhase | null;
  lastAttempt: string | null;
  /** Tautan WA "Minta waktu baru"; hanya saat Perlu waktu baru. */
  requestNewTime: { link: string | null } | null;
  contactWindows: ContactWindowsTarget;
};

/** Hanya kolom yang dibutuhkan tabel — data klinis pasien tidak pernah dikirim ke browser. */
export type BookingRow = {
  id: string;
  code: string;
  status: AppointmentStatusValue;
  timeLabel: string;
  patientName: string;
  patientRecordNumber: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  source: BookingSourceValue;
  sourceLabel: string;
  notes: string | null;
  /** Hanya untuk booking terkonfirmasi (PRD F9, spec C2 3.2). */
  confirmation: { text: string; link: string | null } | null;
  /** Booking WA/telepon berbiaya yang belum diverifikasi (spec C1 bagian 4). */
  transferInstruction: { text: string; link: string | null } | null;
  /** Booking situs yang belum dicocokkan dengan data pasien (spec 6.1). */
  needsMatch: boolean;
  /** Booking dari situs (punya isian): pencocokan pasien berlaku, dan boleh diganti sebelum diverifikasi (spec 6.1). */
  isSiteBooking: boolean;
  /** Isian pendaftaran booking ini, bila ada. */
  intakeId: string | null;
  /** Batas kedaluwarsa atau batas transfer, untuk daftar yang menunggu konfirmasi. */
  deadlineLabel?: string;
  /** Batas transfer sudah lewat: ditulis merah, tetapi booking tidak dibatalkan otomatis (B5). */
  deadlineOverdue?: boolean;
  /** Status isian booking ini (resepsionis boleh melihatnya, spec 6.2). */
  intakeStatus: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA" | null;
  /** Pasien yang sudah dicocokkan; null untuk booking situs yang belum dicocokkan. */
  patientId: string | null;
  /** "Konfirmasi terkirim 10.12 · Rina" dan sejenisnya (spec C2 4.5). */
  messageNotes: string[];
  /** Data dialog Pindah jadwal; tombolnya diatur bookingRowActions. */
  reschedule: RescheduleTarget;
  /** Link kuis yang berlaku (spec C3), atau null. */
  quizLink: string | null;
  /** Booking situs berkuis pendek dari pasien yang belum punya isian lengkap (spec C3 4.3). */
  needsFullIntake: boolean;
  /** Status food recall booking ini, tanpa isinya (spec check-in 4.4). */
  foodRecall: "DITAWARKAN" | "DIISI" | null;
  /** Aksi "Food recall" tersedia: sudah check-in hari ini dan catatan dokter belum final. */
  foodRecallAvailable: boolean;
  /** Aksi "Unggah hasil BIA" tersedia (spec hasil BIA 6.1). */
  biaUploadAvailable: boolean;
  /** Ringkasan unggahan BIA aktif tanpa isi klinis, mis. { fileCount: 2, lastLabel: "10.42 · Rina" }. */
  bia: { fileCount: number; lastLabel: string } | null;
  /** Kanal booking (spec konsultasi online 3.1). */
  channel: "KLINIK" | "ONLINE";
  /** Booking online (spec konsultasi online 5.2); null untuk booking klinik. */
  online: OnlineRowInfo | null;
};

const INTAKE_STATUS_LABEL: Record<NonNullable<BookingRow["intakeStatus"]>, string> = {
  MENUNGGU_DIISI: "belum diisi",
  TERISI: "belum diperiksa",
  DIPERIKSA: "diperiksa",
};

/** Aksi membuka tautan biasa, mengirim WA (dan mencatatnya), atau dijalankan di halaman ini. */
type ActionTarget =
  | { href: string; external: boolean }
  | { send: string; kind: MessageKind; scheduledFor: Date }
  | { onSelect: () => void };

export function AppointmentTable({
  rows,
  canReadRecords,
  highlightId = null,
  emptyText = "Tidak ada booking.",
}: {
  rows: BookingRow[];
  canReadRecords: boolean;
  /** Baris yang disorot dan digulir ke tengah, dari "Lihat di daftar" (spec C1 5.4). */
  highlightId?: string | null;
  emptyText?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [matchTarget, setMatchTarget] = useState<BookingRow | null>(null);
  // Satu menu "Aksi lain" untuk semua baris; barisnya diingat bersama jangkar tombolnya.
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: BookingRow } | null>(null);
  const dialogs = useBookingDialogs();

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        onSuccess?.();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  async function copy(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    const reason = cancelReason;
    setCancelTarget(null);
    setCancelReason("");
    run(() => cancelAppointment(target.id, reason), `Booking ${target.code} dibatalkan.`);
  }

  function actionTarget(action: BookingAction, row: BookingRow): ActionTarget {
    switch (action) {
      case "VERIFY":
        return {
          onSelect: () =>
            run(() => verifyAppointment(row.id), `Booking ${row.code} terkonfirmasi.`, () =>
              // Dialognya di atas daftar: baris ini bisa keluar dari "Menunggu konfirmasi" (spec C2 3.1).
              dialogs.confirmAfterVerify({
                appointmentId: row.id,
                code: row.code,
                description: `${row.patientName} · ${row.timeLabel} · ${row.staffName}`,
              }),
            ),
        };
      case "ATTEND":
        return {
          onSelect: () => dialogs.openCheckIn({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
      case "FOOD_RECALL":
        return {
          onSelect: () => dialogs.openFoodRecall({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
      case "UPLOAD_BIA":
        return {
          onSelect: () => dialogs.openBiaUpload({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
      case "NO_SHOW":
        return { onSelect: () => run(() => markNoShow(row.id), `${row.patientName} ditandai tidak hadir.`) };
      case "RESCHEDULE":
        return { onSelect: () => dialogs.openReschedule(row.reschedule) };
      case "QUIZ_LINK":
        return {
          onSelect: () =>
            dialogs.openQuizLink({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
      case "CHANGE_WINDOWS":
        return { onSelect: () => row.online && dialogs.openContactWindows(row.online.contactWindows) };
      case "REQUEST_NEW_TIME":
        return { href: row.online?.requestNewTime?.link ?? "", external: true };
      case "CANCEL":
        return { onSelect: () => setCancelTarget(row) };
      case "MATCH":
      case "CHANGE_PATIENT":
        return { onSelect: () => setMatchTarget(row) };
      case "SEND_TRANSFER":
        return { send: row.transferInstruction?.link ?? "", kind: "INSTRUKSI_TRANSFER", scheduledFor: row.reschedule.startAt };
      case "COPY_TRANSFER":
        return { onSelect: () => copy(row.transferInstruction?.text ?? "", "Instruksi transfer disalin.") };
      case "SEND_CONFIRMATION":
        return { send: row.confirmation?.link ?? "", kind: "KONFIRMASI", scheduledFor: row.reschedule.startAt };
      case "COPY_CONFIRMATION":
        return { onSelect: () => copy(row.confirmation?.text ?? "", "Teks konfirmasi disalin.") };
      case "VIEW_INTAKE":
        return { href: `/admin/isian/${row.intakeId}`, external: false };
    }
  }

  const mono = { fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" } as const;
  const small = { fontSize: "0.75rem", color: "text.secondary" } as const;

  function primaryAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    const variant = action === "VERIFY" || action === "MATCH" || action === "REQUEST_NEW_TIME" ? "contained" : "outlined";
    if ("send" in target) {
      return (
        <WhatsAppSendButton
          key={action}
          href={target.send}
          appointmentId={row.id}
          kind={target.kind}
          scheduledFor={target.scheduledFor}
          size="small"
          variant={variant}
        >
          {label}
        </WhatsAppSendButton>
      );
    }
    if ("href" in target) {
      return target.external ? (
        <Button key={action} size="small" variant={variant} component="a" href={target.href} target="_blank" rel="noopener noreferrer">
          {label}
        </Button>
      ) : (
        <Button key={action} size="small" variant={variant} component={NextLink} href={target.href}>
          {label}
        </Button>
      );
    }
    return (
      <Button key={action} size="small" variant={variant} disabled={pending} onClick={target.onSelect}>
        {label}
      </Button>
    );
  }

  function menuAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    const close = () => setMenu(null);
    if ("send" in target) {
      return (
        <MenuItem
          key={action}
          component="a"
          href={target.send}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            close();
            void recordSentMessage(row.id, target.kind, target.scheduledFor);
          }}
        >
          {label}
        </MenuItem>
      );
    }
    if ("href" in target) {
      return target.external ? (
        <MenuItem key={action} component="a" href={target.href} target="_blank" rel="noopener noreferrer" onClick={close}>
          {label}
        </MenuItem>
      ) : (
        <MenuItem key={action} component={NextLink} href={target.href} onClick={close}>
          {label}
        </MenuItem>
      );
    }
    return (
      <MenuItem
        key={action}
        disabled={pending}
        sx={action === "CANCEL" ? { color: "error.main" } : undefined}
        onClick={() => {
          close();
          target.onSelect();
        }}
      >
        {label}
      </MenuItem>
    );
  }

  const columns: GridColDef<BookingRow>[] = [
    {
      field: "timeLabel",
      headerName: "Jam",
      minWidth: 120,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5 }}>
          {showsContactWindows(row) && row.online ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              <Box>
                <StatusChip label="Online" />
              </Box>
              {row.online.windowLines.map((line) => (
                <Box key={line} sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
                  {line}
                </Box>
              ))}
              {row.online.phase === "NEEDS_NEW" && (
                <Box>
                  <StatusChip label="Perlu waktu baru" tone="error" />
                </Box>
              )}
              {row.online.lastAttempt && <Box sx={small}>{row.online.lastAttempt}</Box>}
            </Box>
          ) : (
            <Box sx={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 0.5 }}>
              {row.online && <StatusChip label="Online" />}
              {row.timeLabel}
            </Box>
          )}
          <Box sx={mono}>{row.code}</Box>
          {row.deadlineLabel && (
            <Box
              data-tone={row.deadlineOverdue ? "error" : "warning"}
              sx={{ mt: 0.5, fontSize: "0.75rem", fontWeight: 500, color: row.deadlineOverdue ? "error.main" : "warning.main" }}
            >
              {row.deadlineLabel}
            </Box>
          )}
        </Box>
      ),
    },
    {
      field: "patientName",
      headerName: "Pasien",
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5 }}>
          <Box sx={{ fontWeight: 500 }}>{row.patientId ? <TextLink href={`/admin/pasien/${row.patientId}`}>{row.patientName}</TextLink> : row.patientName}</Box>
          {row.needsMatch && (
            <Box sx={{ mt: 0.5 }}>
              <StatusChip label="Belum dicocokkan" />
            </Box>
          )}
          {row.needsFullIntake && (
            <Box sx={{ mt: 0.5 }}>
              <StatusChip label="Belum punya isian lengkap" />
            </Box>
          )}
          <Box sx={small}>
            {row.patientRecordNumber} · {row.sourceLabel}
          </Box>
          {row.notes && <Box sx={{ mt: 0.5, fontSize: "0.75rem" }}>{row.notes}</Box>}
        </Box>
      ),
    },
    { field: "serviceName", headerName: "Layanan", flex: 0.8, minWidth: 120 },
    {
      field: "staffName",
      headerName: "Tenaga",
      flex: 0.9,
      minWidth: 140,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5 }}>
          <div>{row.staffName}</div>
          <Box sx={small}>{row.branchName}</Box>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      flex: 0.9,
      minWidth: 140,
      valueGetter: (_value, row) => STATUS_LABEL[row.status],
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5 }}>
          <AppointmentStatusBadge status={row.status} />
          {row.intakeStatus && <Box sx={{ ...small, mt: 0.5 }}>Isian: {INTAKE_STATUS_LABEL[row.intakeStatus]}</Box>}
          {row.foodRecall && <Box sx={{ ...small, mt: 0.5 }}>Food recall: {row.foodRecall === "DIISI" ? "sudah diisi" : "belum diisi"}</Box>}
          {row.bia && (
            <Box sx={{ ...small, mt: 0.5 }}>
              BIA terunggah: {row.bia.fileCount} berkas · {row.bia.lastLabel}
            </Box>
          )}
          {row.messageNotes.map((note) => (
            <Box key={note} sx={{ ...small, mt: 0.5 }}>
              {note}
            </Box>
          ))}
        </Box>
      ),
    },
    {
      field: "actions",
      headerName: "Aksi",
      flex: 1,
      minWidth: 200,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => {
        const actions = bookingRowActions({ ...row, requestNewTime: row.online?.requestNewTime ?? null }, canReadRecords);
        return (
          <Box sx={{ width: "100%", py: 0.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5 }}>
            {actions.primary.map((action) => primaryAction(action, row))}
            {actions.menu.length > 0 && (
              <IconButton size="small" aria-label={`Aksi lain ${row.code}`} aria-haspopup="menu" onClick={(event) => setMenu({ anchor: event.currentTarget, row })}>
                <MoreHoriz fontSize="small" />
              </IconButton>
            )}
          </Box>
        );
      },
    },
  ];

  const menuRow = menu?.row;
  const menuActions = menuRow ? bookingRowActions({ ...menuRow, requestNewTime: menuRow.online?.requestNewTime ?? null }, canReadRecords).menu : [];

  return (
    <>
      <AdminDataGrid rows={rows} columns={columns} label="Daftar booking" emptyText={emptyText} highlightId={highlightId ?? undefined} />

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {menuRow && menuActions.map((action) => menuAction(action, menuRow))}
      </Menu>

      {matchTarget && (
        <MatchPatientDialog
          key={matchTarget.id}
          appointmentId={matchTarget.id}
          code={matchTarget.code}
          open
          onOpenChange={(open) => {
            if (!open) setMatchTarget(null);
          }}
        />
      )}

      <Dialog
        open={cancelTarget !== null}
        onClose={() => {
          setCancelTarget(null);
          setCancelReason("");
        }}
        slotProps={{ paper: { role: "alertdialog" } }}
      >
        <DialogTitle>Batalkan booking {cancelTarget?.code}?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {cancelTarget?.patientName}, {cancelTarget?.timeLabel}. Slotnya akan dibuka kembali. Booking tetap tersimpan dengan status Dibatalkan.
          </DialogContentText>
          <TextField
            id="cancel-reason"
            label="Alasan (opsional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Misal: pasien minta jadwal ulang minggu depan"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCancelTarget(null);
              setCancelReason("");
            }}
          >
            Kembali
          </Button>
          <Button variant="contained" color="error" onClick={confirmCancel}>
            Batalkan Booking
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
