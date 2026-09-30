"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIndonesianDate, formatRupiah } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { cancelSiteBooking, findBookingStatus, type PublicBookingStatus } from "@/server/public-booking";

const ACTIVE = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

export function BookingStatusLookup() {
  const [code, setCode] = useState("");
  const [last4, setLast4] = useState("");
  const [status, setStatus] = useState<PublicBookingStatus | null>(null);
  // 4 digit yang dipakai pencarian berhasil — batal memakai ini, bukan isi kolom yang mungkin sudah diubah.
  const [lookedUpLast4, setLookedUpLast4] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function lookup(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await findBookingStatus({ code, last4 });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setStatus(result.data);
        setLookedUpLast4(last4);
        setNotFound(result.data === null);
      } catch {
        toast.error("Gagal memeriksa status. Coba lagi.");
      }
    });
  }

  function cancel() {
    if (!status) return;
    const bookingCode = status.code;
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await cancelSiteBooking({ code: bookingCode, last4: lookedUpLast4 });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setStatus(result.data);
        toast.success("Booking dibatalkan.");
      } catch {
        toast.error("Pembatalan gagal. Coba lagi.");
      }
    });
  }

  const paidFee = status?.status === "TERKONFIRMASI" && status.bookingFee;

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl text-brown-900">Cek Status Booking</h1>

      <form onSubmit={lookup} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="kode-booking">Kode booking</Label>
          <Input
            id="kode-booking"
            placeholder="SDY-XXXX"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="empat-digit">4 digit terakhir nomor WhatsApp</Label>
          <Input
            id="empat-digit"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          Cek Status
        </Button>
      </form>

      {notFound && (
        <p role="status" className="text-sm text-brown-700">
          Booking tidak ditemukan. Periksa kode dan 4 digit terakhir nomor WhatsApp Anda.
        </p>
      )}

      {status && (
        <section aria-label="Status booking" className="space-y-3 rounded-2xl border border-cream-300 bg-white p-4">
          <p className="font-mono text-sm text-brown-600">{status.code}</p>
          <p className="text-xl font-semibold text-brown-900">{status.statusLabel}</p>
          <dl className="space-y-1 text-sm text-brown-700">
            <div>{status.serviceName} · {status.staffName}</div>
            <div>{status.branchName}</div>
            <div>
              {formatIndonesianDate(status.startAt)}, pukul {minutesToTimeLabel(witaMinutesOfDay(status.startAt))} WITA
            </div>
            <div>{status.maskedWhatsapp}</div>
          </dl>

          {status.status === "KEDALUWARSA" && (
            <p className="text-sm text-brown-700">
              Booking ini kedaluwarsa karena belum dikonfirmasi dalam 24 jam.{" "}
              <Link href="/daftar" className="underline underline-offset-4">
                Booking ulang
              </Link>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {status.canReschedule && status.rescheduleLink && (
              <Button asChild variant="outline">
                <a href={status.rescheduleLink} target="_blank" rel="noopener noreferrer">
                  Pindah jadwal via WhatsApp
                </a>
              </Button>
            )}
            {status.canCancel && (
              <Button variant="destructive" onClick={() => setConfirming(true)} disabled={pending}>
                Batalkan booking
              </Button>
            )}
          </div>

          {!status.canCancel && ACTIVE.includes(status.status) && (
            <p className="text-sm text-brown-700">
              Kurang dari 2 jam sebelum jadwal. Untuk batal atau pindah jadwal, hubungi kami lewat{" "}
              <a
                href={buildWhatsAppLink(`Halo SunDY Clinic, saya ingin mengubah booking ${status.code}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                WhatsApp
              </a>
              .
            </p>
          )}
        </section>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan booking {status?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {paidFee
                ? `Biaya booking ${formatRupiah(paidFee)} tidak dikembalikan. Ingin pindah jadwal saja? Biaya tetap berlaku bila jadwal dipindah paling lambat 2 jam sebelumnya.`
                : "Jam Anda akan dilepas agar bisa dipesan orang lain."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cancel}>
              Ya, batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
