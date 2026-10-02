"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import {
  BOOKING_ACTION_LABEL,
  bookingRowActions,
  type BookingAction,
  type RescheduleTarget,
} from "@/lib/booking-actions";
import type { MessageKind } from "@/lib/booking-messages";
import type { BookingSourceValue } from "@/lib/payment";
import { cn } from "@/lib/utils";
import {
  cancelAppointment,
  markAttended,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { useBookingDialogs } from "./booking-dialogs";
import { MatchPatientDialog } from "./match-patient-dialog";
import { recordSentMessage, WhatsAppSendButton } from "./whatsapp-send-button";

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
}: {
  rows: BookingRow[];
  canReadRecords: boolean;
  /** Baris yang disorot dan digulir ke tengah, dari "Lihat di daftar" (spec C1 5.4). */
  highlightId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [matchTarget, setMatchTarget] = useState<BookingRow | null>(null);
  const dialogs = useBookingDialogs();
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // Sekali per sorotan. Dipanggil bersyarat karena jsdom tidak punya scrollIntoView.
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "center" });
  }, [highlightId]);

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
        return { onSelect: () => run(() => markAttended(row.id), `${row.patientName} hadir.`) };
      case "NO_SHOW":
        return { onSelect: () => run(() => markNoShow(row.id), `${row.patientName} ditandai tidak hadir.`) };
      case "RESCHEDULE":
        return { onSelect: () => dialogs.openReschedule(row.reschedule) };
      case "QUIZ_LINK":
        return {
          onSelect: () =>
            dialogs.openQuizLink({ appointmentId: row.id, code: row.code, patientName: row.patientName }),
        };
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

  function linkElement(target: { href: string; external: boolean }, label: string) {
    return target.external ? (
      <a href={target.href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <Link href={target.href}>{label}</Link>
    );
  }

  function primaryAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    const variant = action === "VERIFY" || action === "MATCH" ? "default" : "outline";
    if ("send" in target) {
      return (
        <WhatsAppSendButton
          key={action}
          href={target.send}
          appointmentId={row.id}
          kind={target.kind}
          scheduledFor={target.scheduledFor}
          size="sm"
          variant={variant}
        >
          {label}
        </WhatsAppSendButton>
      );
    }
    if ("href" in target) {
      return (
        <Button key={action} size="sm" variant={variant} asChild>
          {linkElement(target, label)}
        </Button>
      );
    }
    return (
      <Button key={action} size="sm" variant={variant} disabled={pending} onClick={target.onSelect}>
        {label}
      </Button>
    );
  }

  function menuAction(action: BookingAction, row: BookingRow) {
    const target = actionTarget(action, row);
    const label = BOOKING_ACTION_LABEL[action];
    if ("send" in target) {
      return (
        <DropdownMenuItem key={action} asChild>
          <a
            href={target.send}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void recordSentMessage(row.id, target.kind, target.scheduledFor)}
          >
            {label}
          </a>
        </DropdownMenuItem>
      );
    }
    if ("href" in target) {
      return (
        <DropdownMenuItem key={action} asChild>
          {linkElement(target, label)}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem
        key={action}
        variant={action === "CANCEL" ? "destructive" : "default"}
        disabled={pending}
        onSelect={target.onSelect}
      >
        {label}
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jam</TableHead>
            <TableHead>Pasien</TableHead>
            <TableHead>Layanan</TableHead>
            <TableHead>Tenaga</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const actions = bookingRowActions(row, canReadRecords);
            const highlighted = row.id === highlightId;
            return (
              <TableRow
                key={row.id}
                ref={highlighted ? highlightRef : undefined}
                data-highlighted={highlighted ? "true" : undefined}
                className={cn(highlighted && "bg-amber-100/70 hover:bg-amber-100")}
              >
                <TableCell className="align-top whitespace-nowrap">
                  <div className="font-medium">{row.timeLabel}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
                  {row.deadlineLabel && (
                    <div
                      className={cn(
                        "mt-1 text-xs font-medium",
                        row.deadlineOverdue ? "text-destructive" : "text-amber-700",
                      )}
                    >
                      {row.deadlineLabel}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <div className="font-medium">
                    {row.patientId ? (
                      <Link href={`/admin/pasien/${row.patientId}`} className="underline-offset-4 hover:underline">
                        {row.patientName}
                      </Link>
                    ) : (
                      row.patientName
                    )}
                  </div>
                  {row.needsMatch && (
                    <Badge variant="outline" className="mt-1">
                      Belum dicocokkan
                    </Badge>
                  )}
                  {row.needsFullIntake && (
                    <Badge variant="outline" className="mt-1">
                      Belum punya isian lengkap
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {row.patientRecordNumber} · {row.sourceLabel}
                  </div>
                  {row.notes && <div className="mt-1 text-xs">{row.notes}</div>}
                </TableCell>
                <TableCell className="align-top">{row.serviceName}</TableCell>
                <TableCell className="align-top">
                  <div>{row.staffName}</div>
                  <div className="text-xs text-muted-foreground">{row.branchName}</div>
                </TableCell>
                <TableCell className="align-top">
                  <AppointmentStatusBadge status={row.status} />
                  {row.intakeStatus && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Isian: {INTAKE_STATUS_LABEL[row.intakeStatus]}
                    </div>
                  )}
                  {row.messageNotes.map((note) => (
                    <div key={note} className="mt-1 text-xs text-muted-foreground">
                      {note}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    {actions.primary.map((action) => primaryAction(action, row))}
                    {actions.menu.length > 0 && (
                      // Tanpa modal: dialog yang dibuka dari menu tidak boleh mewarisi kunci pointer menu.
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" aria-label={`Aksi lain ${row.code}`}>
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.menu.map((action) => menuAction(action, row))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan booking {cancelTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.patientName}, {cancelTarget?.timeLabel}. Slotnya akan dibuka kembali.
              Booking tetap tersimpan dengan status Dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Alasan (opsional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Misal: pasien minta jadwal ulang minggu depan"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmCancel}>
              Batalkan Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
