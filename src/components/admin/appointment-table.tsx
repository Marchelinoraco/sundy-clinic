"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import type { AppointmentStatusValue } from "@/lib/appointment-status";
import {
  cancelAppointment,
  markAttended,
  markNoShow,
  verifyAppointment,
} from "@/server/appointment";
import { AppointmentStatusBadge } from "./appointment-status-badge";
import { MatchPatientDialog } from "./match-patient-dialog";

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
  sourceLabel: string;
  notes: string | null;
  /** Hanya untuk booking terkonfirmasi (PRD F9). */
  confirmation: { text: string; link: string | null } | null;
  /** Booking situs yang belum dicocokkan dengan data pasien (spec 6.1). */
  needsMatch: boolean;
  /** Booking dari situs (punya isian): pencocokan pasien berlaku, dan boleh diganti sebelum diverifikasi (spec 6.1). */
  isSiteBooking: boolean;
  /** Isian pendaftaran booking ini, bila ada. */
  intakeId: string | null;
  /** Batas sebelum booking situs kedaluwarsa, untuk daftar yang menunggu konfirmasi. */
  deadlineLabel?: string;
  /** Status isian booking ini (resepsionis boleh melihatnya, spec 6.2). */
  intakeStatus: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA" | null;
  /** Pasien yang sudah dicocokkan; null untuk booking situs yang belum dicocokkan. */
  patientId: string | null;
};

const ACTIVE: AppointmentStatusValue[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

const INTAKE_STATUS_LABEL: Record<NonNullable<BookingRow["intakeStatus"]>, string> = {
  MENUNGGU_DIISI: "belum diisi",
  TERISI: "belum diperiksa",
  DIPERIKSA: "diperiksa",
};

export function AppointmentTable({ rows, canReadRecords }: { rows: BookingRow[]; canReadRecords: boolean }) {
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  async function copyConfirmation(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Teks konfirmasi disalin.");
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
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="align-top whitespace-nowrap">
                <div className="font-medium">{row.timeLabel}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
                {row.deadlineLabel && (
                  <div className="mt-1 text-xs font-medium text-amber-700">{row.deadlineLabel}</div>
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
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap gap-1">
                  {row.status === "MENUNGGU_KONFIRMASI" && row.needsMatch && (
                    <MatchPatientDialog appointmentId={row.id} code={row.code} />
                  )}
                  {row.status === "MENUNGGU_KONFIRMASI" && !row.needsMatch && row.isSiteBooking && (
                    <MatchPatientDialog appointmentId={row.id} code={row.code} triggerLabel="Ganti pasien" variant="outline" />
                  )}
                  {row.status === "MENUNGGU_KONFIRMASI" && !row.needsMatch && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => verifyAppointment(row.id), `Booking ${row.code} terkonfirmasi.`)
                      }
                    >
                      Verifikasi
                    </Button>
                  )}
                  {row.intakeId && canReadRecords && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/admin/isian/${row.intakeId}`}>Lihat isian</Link>
                    </Button>
                  )}
                  {row.confirmation && (
                    <>
                      {row.confirmation.link && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={row.confirmation.link} target="_blank" rel="noopener noreferrer">
                            Kirim WhatsApp
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyConfirmation(row.confirmation!.text)}
                      >
                        Salin teks
                      </Button>
                    </>
                  )}
                  {ACTIVE.includes(row.status) && (
                    <>
                      {!row.needsMatch && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => run(() => markAttended(row.id), `${row.patientName} hadir.`)}
                          >
                            Hadir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(() => markNoShow(row.id), `${row.patientName} ditandai tidak hadir.`)
                            }
                          >
                            Tidak Hadir
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={pending}
                        onClick={() => setCancelTarget(row)}
                      >
                        Batalkan
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
