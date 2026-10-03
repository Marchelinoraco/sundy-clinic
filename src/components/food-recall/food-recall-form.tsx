"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { ActivityList } from "@/components/kuis/activity-list";
import { Button } from "@/components/ui/button";
import type { FoodRecallPage } from "@/lib/food-recall";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { submitFoodRecall } from "@/server/food-recall-public";

/**
 * Form food recall H-1 (spec check-in 4.3), seperti "Aktivitas kemarin" kuis v1.
 * Tanpa draf di perangkat: tablet klinik dipakai bergantian.
 */
export function FoodRecallForm({
  code,
  page,
  onSubmitted,
}: {
  code: string;
  page: Extract<FoodRecallPage, { state: "OPEN" }>;
  onSubmitted: () => void;
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitFoodRecall({ code, entries, website });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSubmitted();
      } catch {
        setError("Catatan gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <p className="text-brown-700">Halo {page.firstName},</p>
        <h1 className="font-display text-3xl text-brown-900">
          Apa saja yang Anda makan, minum, dan lakukan kemarin, {page.recallDateLabel}?
        </h1>
        <p className="text-sm text-brown-700">
          Tambahkan satu per satu: jam, jenisnya, lalu isinya. Tulis yang benar-benar terjadi kemarin.
        </p>
      </div>

      <ActivityList entries={entries} onChange={setEntries} />

      {/* Kolom jebakan: tersembunyi dari manusia, diisi bot. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <p className="text-xs text-brown-600">
        Catatan ini hanya dibaca dokter SunDY untuk konsultasi Anda.{" "}
        <Link href="/kebijakan-privasi" className="underline underline-offset-4">
          Kebijakan Privasi
        </Link>
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={pending || entries.length === 0}>
        Kirim
      </Button>
    </form>
  );
}
