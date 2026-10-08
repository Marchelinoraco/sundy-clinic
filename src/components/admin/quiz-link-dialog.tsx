"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getQuizLink, rotateQuizLink, type QuizLinkInfo } from "@/server/quiz-link-admin";
import { DialogCloseButton } from "./mui/dialog-close-button";
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

  const close = () => onOpenChange(false);
  return (
    <>
      <Dialog open={open} onClose={close} maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Link kuis — {target.code}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{target.patientName}</DialogContentText>
          {info === undefined ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Memuat link…
            </Typography>
          ) : info === null ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Link kuis tidak tersedia: kuisnya sudah diisi, atau booking tidak aktif lagi.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {qr && (
                // QR selalu di atas putih agar terbaca kamera, juga di mode gelap.
                <Box
                  component="img"
                  src={qr}
                  alt="QR link kuis"
                  sx={{ mx: "auto", width: 224, height: 224, borderRadius: 1.5, border: 1, borderColor: "divider", bgcolor: "common.white", p: 1 }}
                />
              )}
              <Button component="a" href={info.url} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth>
                Buka di perangkat ini
              </Button>
              {info.message.link ? (
                <WhatsAppSendButton href={info.message.link} appointmentId={target.appointmentId} kind="LINK_KUIS" scheduledFor={info.scheduledFor} color="success" fullWidth>
                  Kirim link via WA
                </WhatsAppSendButton>
              ) : (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Nomor WhatsApp pasien tidak dikenali.
                </Typography>
              )}
              <Button type="button" variant="outlined" fullWidth onClick={() => void copy(info.url)}>
                Salin link
              </Button>
              <Button type="button" variant="text" color="error" fullWidth disabled={pending} onClick={() => setConfirmRotate(true)}>
                Ganti link
              </Button>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRotate} onClose={() => setConfirmRotate(false)} maxWidth="xs" slotProps={{ paper: { role: "alertdialog" } }}>
        <DialogTitle>Ganti link kuis?</DialogTitle>
        <DialogContent>
          <DialogContentText>Link lama langsung tidak berlaku. Kirim link baru ke pasien setelah ini.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRotate(false)}>Kembali</Button>
          <Button variant="contained" onClick={rotate}>
            Ganti
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
