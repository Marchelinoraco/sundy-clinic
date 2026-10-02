"use client";

import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getQuizLink, rotateQuizLink, type QuizLinkInfo } from "@/server/quiz-link-admin";
import { WhatsAppSendButton } from "./whatsapp-send-button";

export type QuizLinkTarget = { appointmentId: string; code: string; patientName: string };

/**
 * Link kuis sebuah booking (spec C3 4.2): QR untuk dipindai HP pasien, buka di
 * tablet klinik, kirim lewat WA, salin, atau ganti link. QR dibuat di browser,
 * jadi link tidak dikirim ke layanan luar.
 */
export function QuizLinkDialog({
  target,
  open,
  onOpenChange,
}: {
  target: QuizLinkTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // undefined = masih dimuat; null = link tidak tersedia.
  const [info, setInfo] = useState<QuizLinkInfo | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getQuizLink(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          setInfo(null);
          return;
        }
        setInfo(result.data);
      })
      .catch(() => {
        if (!current) return;
        toast.error("Link kuis gagal dimuat. Coba lagi.");
        setInfo(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  const url = info?.url;
  useEffect(() => {
    if (!url) return;
    let current = true;
    QRCode.toString(url, { type: "svg", margin: 1 })
      .then((svg) => {
        if (current) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (current) setQr(null);
      });
    return () => {
      current = false;
    };
  }, [url]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin link secara manual.");
    }
  }

  function rotate() {
    setConfirmRotate(false);
    startTransition(async () => {
      try {
        const result = await rotateQuizLink(target.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setInfo(result.data);
        toast.success("Link baru dibuat. Link lama tidak berlaku lagi.");
      } catch {
        toast.error("Gagal mengganti link. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link kuis — {target.code}</DialogTitle>
          <DialogDescription>{target.patientName}</DialogDescription>
        </DialogHeader>

        {info === undefined ? (
          <p className="text-sm text-muted-foreground">Memuat link…</p>
        ) : info === null ? (
          <p className="text-sm text-muted-foreground">
            Link kuis tidak tersedia: kuisnya sudah diisi, atau booking tidak aktif lagi.
          </p>
        ) : (
          <div className="space-y-2">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI SVG buatan browser, bukan gambar dari server
              <img src={qr} alt="QR link kuis" className="mx-auto size-56 rounded-md border bg-white p-2" />
            )}
            <Button asChild variant="outline" className="w-full">
              <a href={info.url} target="_blank" rel="noopener noreferrer">
                Buka di perangkat ini
              </a>
            </Button>
            {info.message.link ? (
              <WhatsAppSendButton
                href={info.message.link}
                appointmentId={target.appointmentId}
                kind="LINK_KUIS"
                scheduledFor={info.scheduledFor}
                className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
              >
                Kirim link via WA
              </WhatsAppSendButton>
            ) : (
              <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => void copy(info.url)}>
              Salin link
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-destructive"
              disabled={pending}
              onClick={() => setConfirmRotate(true)}
            >
              Ganti link
            </Button>
          </div>
        )}

        <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ganti link kuis?</AlertDialogTitle>
              <AlertDialogDescription>
                Link lama langsung tidak berlaku. Kirim link baru ke pasien setelah ini.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Kembali</AlertDialogCancel>
              <AlertDialogAction onClick={rotate}>Ganti</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
