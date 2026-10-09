"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";

type ShownInfo = Exclude<FoodRecallLinkInfo, { state: "NOT_OFFERED" }>;

/**
 * Link food recall (spec check-in 4.2): QR untuk HP customer, buka di tablet
 * klinik, kirim lewat WA, atau salin. QR dibuat di browser, jadi link tidak
 * dikirim ke layanan luar. Isi catatan tidak pernah ada di panel ini.
 */
export function FoodRecallLinkPanel({ info }: { info: ShownInfo }) {
  const url = info.state === "OPEN" ? info.url : null;
  const [qr, setQr] = useState<string | null>(null);

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

  // Dicek lebih dulu (bukan state !== "OPEN"): ShownInfo bukan union diskriminasi murni
  // (satu anggotanya berstate "CLOSED" | "RECEIVED"), jadi TypeScript hanya menyaring
  // anggota "OPEN" dengan pasti lewat perbandingan positif terhadap literal tunggal ini.
  if (info.state === "OPEN") {
    return (
      <Stack spacing={1}>
        <Typography variant="body2">{info.filled ? "Sudah diisi — customer masih bisa mengirim ulang." : "Belum diisi."}</Typography>
        {qr && (
          // QR selalu di atas putih agar terbaca kamera, juga di mode gelap.
          <Box
            component="img"
            src={qr}
            alt="QR link food recall"
            sx={{ mx: "auto", width: 224, height: 224, borderRadius: 1.5, border: 1, borderColor: "divider", bgcolor: "common.white", p: 1 }}
          />
        )}
        <Button component="a" href={info.url} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth>
          Buka di tablet
        </Button>
        {info.message.link ? (
          <Button component="a" href={info.message.link} target="_blank" rel="noopener noreferrer" variant="contained" color="success" fullWidth>
            Kirim lewat WA
          </Button>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nomor WhatsApp pasien tidak dikenali.
          </Typography>
        )}
        <Button type="button" variant="outlined" fullWidth onClick={() => void copy(info.url)}>
          Salin link
        </Button>
      </Stack>
    );
  }

  if (info.state === "RECEIVED")
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Food recall sudah diterima dokter.
      </Typography>
    );
  return (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      Link food recall tidak berlaku lagi: hanya bisa dibuka pada hari kunjungan selama customer berstatus hadir.
    </Typography>
  );
}
