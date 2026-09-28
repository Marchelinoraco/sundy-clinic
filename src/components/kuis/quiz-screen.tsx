"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type QuizScreenProps = {
  title: string;
  hint?: string;
  /** 0–1: seberapa jauh pasien di seluruh alur pendaftaran. */
  progress: number;
  onBack?: () => void;
  /** Tanpa onNext tombol Lanjut tidak tampil — layar pilihan tunggal maju sendiri. */
  onNext?: () => void;
  nextLabel?: string;
  /** Pesan bila layar belum lengkap. Baru ditampilkan setelah pasien menekan Lanjut. */
  error?: string | null;
  pending?: boolean;
  children: ReactNode;
};

/**
 * Satu layar kuis bergaya BetterMe: batang progres, satu pertanyaan, kartu
 * jawaban besar. Beri `key` per layar agar status "sudah mencoba Lanjut"
 * tidak terbawa ke layar berikutnya.
 */
export function QuizScreen({
  title,
  hint,
  progress,
  onBack,
  onNext,
  nextLabel = "Lanjut",
  error,
  pending,
  children,
}: QuizScreenProps) {
  const [attempted, setAttempted] = useState(false);
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  function handleNext() {
    if (error) {
      setAttempted(true);
      return;
    }
    onNext?.();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col px-4 py-6">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-brown-600 hover:text-brown-900"
            aria-label="Kembali"
          >
            ‹ Kembali
          </button>
        ) : (
          <span className="w-16" />
        )}
        <div
          role="progressbar"
          aria-label="Kemajuan pendaftaran"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200"
        >
          <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <h1 className="mt-6 font-display text-3xl leading-tight text-brown-900">{title}</h1>
      {hint && <p className="mt-2 text-sm text-brown-600">{hint}</p>}

      <div className="mt-6 flex-1 space-y-3">{children}</div>

      {attempted && error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {onNext && (
        <Button
          type="button"
          size="lg"
          className="mt-6 h-12 rounded-full text-base"
          onClick={handleNext}
          disabled={pending}
        >
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
