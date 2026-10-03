"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
      <div className="space-y-2">
        <p className="text-sm">{info.filled ? "Sudah diisi — customer masih bisa mengirim ulang." : "Belum diisi."}</p>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data URI SVG buatan browser, bukan gambar dari server
          <img src={qr} alt="QR link food recall" className="mx-auto size-56 rounded-md border bg-white p-2" />
        )}
        <Button asChild variant="outline" className="w-full">
          <a href={info.url} target="_blank" rel="noopener noreferrer">
            Buka di tablet
          </a>
        </Button>
        {info.message.link ? (
          <Button asChild className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
            <a href={info.message.link} target="_blank" rel="noopener noreferrer">
              Kirim lewat WA
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
        )}
        <Button type="button" variant="outline" className="w-full" onClick={() => void copy(info.url)}>
          Salin link
        </Button>
      </div>
    );
  }

  if (info.state === "RECEIVED") return <p className="text-sm text-muted-foreground">Food recall sudah diterima dokter.</p>;
  return (
    <p className="text-sm text-muted-foreground">
      Link food recall tidak berlaku lagi: hanya bisa dibuka pada hari kunjungan selama customer berstatus hadir.
    </p>
  );
}
