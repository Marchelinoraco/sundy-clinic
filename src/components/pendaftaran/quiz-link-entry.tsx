"use client";

import { useEffect, useState } from "react";
import type { QuizLinkPage } from "@/lib/quiz-link";
import { getQuizLinkPage } from "@/server/quiz-link-public";
import { QuizLinkFlow } from "./quiz-link-flow";
import { QuizLinkNotice } from "./quiz-link-notice";

type Loaded = { code: string; page: QuizLinkPage } | { failed: true };

/**
 * Membaca kode dari bagian "#" URL — bagian itu tidak pernah dikirim browser ke
 * server — lalu memuat isi halaman lewat aksi server (spec C3 3.1).
 */
export function QuizLinkEntry() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (!code) {
      setLoaded({ code: "", page: { state: "CLOSED" } });
      return;
    }
    let current = true;
    getQuizLinkPage(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? { code, page: result.data } : { failed: true });
      })
      .catch(() => {
        if (current) setLoaded({ failed: true });
      });
    return () => {
      current = false;
    };
  }, []);

  if (!loaded) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;
  if ("failed" in loaded) {
    return (
      <p className="px-4 py-16 text-center text-brown-700">
        Halaman gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.
      </p>
    );
  }
  if (loaded.page.state === "OPEN") {
    return (
      <QuizLinkFlow
        code={loaded.code}
        page={loaded.page}
        onSubmitted={() => setLoaded({ code: loaded.code, page: { state: "SUBMITTED" } })}
      />
    );
  }
  return <QuizLinkNotice state={loaded.page.state} />;
}
