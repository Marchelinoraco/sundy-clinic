"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED, type FoodRecallPage } from "@/lib/food-recall";
import { getFoodRecallPage } from "@/server/food-recall-public";
import { FoodRecallForm } from "./food-recall-form";

type Loaded =
  | { kind: "EMPTY" }
  | { kind: "FAILED" }
  | { kind: "SUBMITTED" }
  | { kind: "PAGE"; code: string; page: FoodRecallPage };

const EMPTY_MESSAGE = "Buka link dari klinik untuk mengisi catatan ini.";

function codeFromHash(): string {
  return decodeURIComponent(window.location.hash.slice(1)).trim();
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
      <h1 className="font-display text-3xl text-brown-900">{title}</h1>
      <p className="text-brown-700">{text}</p>
    </div>
  );
}

/**
 * Halaman /food-recall (spec check-in 4.2–4.3). Kode ada di bagian "#" URL dan
 * hanya dibaca browser. Setelah Kirim, layar terima kasih tidak menampilkan
 * isian; Selesai membuang kode dari URL untuk customer berikutnya di tablet.
 */
export function FoodRecallEntry() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const code = codeFromHash();
    if (!code) {
      setLoaded({ kind: "EMPTY" });
      return;
    }
    let current = true;
    getFoodRecallPage(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? { kind: "PAGE", code, page: result.data } : { kind: "FAILED" });
      })
      .catch(() => {
        if (current) setLoaded({ kind: "FAILED" });
      });
    return () => {
      current = false;
    };
  }, []);

  function finish() {
    window.history.replaceState(null, "", "/food-recall");
    setLoaded({ kind: "EMPTY" });
  }

  if (!loaded) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;
  if (loaded.kind === "EMPTY") return <Notice title="Catatan makan kemarin" text={EMPTY_MESSAGE} />;
  if (loaded.kind === "FAILED") {
    return <Notice title="Halaman gagal dimuat" text="Periksa koneksi lalu muat ulang halaman ini." />;
  }
  if (loaded.kind === "SUBMITTED") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-brown-900">Terima kasih</h1>
        <p className="text-brown-700">Terima kasih, dokter akan melihatnya saat konsultasi.</p>
        <Button type="button" size="lg" className="h-12 w-full rounded-full text-base" onClick={finish}>
          Selesai
        </Button>
      </div>
    );
  }
  if (loaded.page.state === "CLOSED") return <Notice title="Link tidak berlaku" text={FOOD_RECALL_CLOSED} />;
  if (loaded.page.state === "RECEIVED") return <Notice title="Sudah diterima" text={FOOD_RECALL_RECEIVED} />;
  return <FoodRecallForm code={loaded.code} page={loaded.page} onSubmitted={() => setLoaded({ kind: "SUBMITTED" })} />;
}
