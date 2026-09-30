"use client";

import { useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

export const AUTOSAVE_DELAY_MS = 1500;
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [2000, 4000, 8000, 16000, 30000];

export type SavedDraft = { version: string; savedAt: string };

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved"; savedAt: string }
  | { kind: "retrying" }
  | { kind: "rejected"; message: string };

type Options<T> = {
  initialVersion: string;
  save: (version: string, value: T) => Promise<ActionResult<SavedDraft>>;
  /** Pesan bila nilai belum boleh dikirim, atau null. */
  validate: (value: T) => string | null;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
};

/**
 * Simpan otomatis draf (spec 7). Pada satu waktu hanya ada satu permintaan,
 * selalu dengan versi terakhir dari server, dan nilai terbaru yang menang.
 * Galat jaringan dicoba ulang dengan jeda bertambah. Penolakan server (isian
 * tidak sah, diubah di tempat lain, sudah final) ditampilkan dan menunggu
 * perubahan berikutnya.
 */
class DraftSaver<T> {
  options: Options<T>;
  private version: string;
  private unsaved: { value: T } | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  constructor(
    options: Options<T>,
    private readonly report: (status: AutosaveStatus) => void,
  ) {
    this.options = options;
    this.version = options.initialVersion;
  }

  change(value: T) {
    this.unsaved = { value };
    this.report({ kind: "pending" });
    this.schedule(this.options.delayMs ?? AUTOSAVE_DELAY_MS);
  }

  /** Membatalkan simpan terjadwal dan menunggu yang sedang berjalan; mengembalikan versi terakhir. */
  async settle(): Promise<string> {
    this.cancelTimer();
    await this.queue;
    return this.version;
  }

  /** Setelah finalisasi atau pembuangan berhasil: tidak ada lagi yang perlu disimpan. */
  forget() {
    this.cancelTimer();
    this.unsaved = null;
    this.report({ kind: "idle" });
  }

  dispose() {
    this.cancelTimer();
  }

  private schedule(delay: number) {
    this.cancelTimer();
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): Promise<void> {
    this.queue = this.queue.then(() => this.attempt());
    return this.queue;
  }

  private async attempt() {
    const pending = this.unsaved;
    if (!pending) return;
    const problem = this.options.validate(pending.value);
    if (problem) {
      this.report({ kind: "rejected", message: problem });
      return;
    }
    this.unsaved = null;
    try {
      const result = await this.options.save(this.version, pending.value);
      if (!result.ok) {
        this.unsaved ??= pending;
        this.report({ kind: "rejected", message: result.error });
        return;
      }
      this.failures = 0;
      this.version = result.data.version;
      this.report(this.unsaved ? { kind: "pending" } : { kind: "saved", savedAt: result.data.savedAt });
    } catch {
      // Ketikan yang lebih baru (bila ada) menang atas nilai yang gagal dikirim.
      this.unsaved ??= pending;
      const delays = this.options.retryDelaysMs ?? AUTOSAVE_RETRY_DELAYS_MS;
      const delay = delays[Math.min(this.failures, delays.length - 1)];
      this.failures += 1;
      this.report({ kind: "retrying" });
      this.schedule(delay);
    }
  }
}

export function useDraftAutosave<T>(options: Options<T>) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const [saver] = useState(() => new DraftSaver<T>(options, setStatus));

  useEffect(() => {
    saver.options = options;
  });
  useEffect(() => () => saver.dispose(), [saver]);

  // Peringatkan sebelum halaman ditutup selama ada perubahan yang belum tersimpan.
  useEffect(() => {
    if (status.kind === "idle" || status.kind === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status.kind]);

  return {
    status,
    change: (value: T) => saver.change(value),
    settle: () => saver.settle(),
    forget: () => saver.forget(),
  };
}
