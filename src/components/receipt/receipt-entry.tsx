"use client";

import { useEffect, useState } from "react";
import { RECEIPT_CANCELLED_TEXT, RECEIPT_INVALID_TEXT, type PublicReceiptPage } from "@/lib/receipt";
import { getPublicReceipt } from "@/server/receipt-public";
import { ReceiptPaper } from "./receipt-paper";

type Loaded = PublicReceiptPage | { state: "FAILED"; message: string } | null;

const LOAD_FAILED = "Struk gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.";

/** Membaca kode dari "#" (tidak pernah dikirim browser ke server), lalu memuat struk lewat aksi server. */
export function ReceiptEntry() {
  const [loaded, setLoaded] = useState<Loaded>(null);

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (!code) {
      setLoaded({ state: "INVALID" });
      return;
    }
    let current = true;
    getPublicReceipt(code)
      .then((result) => {
        if (current) setLoaded(result.ok ? result.data : { state: "FAILED", message: result.error });
      })
      .catch(() => {
        if (current) setLoaded({ state: "FAILED", message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, []);

  if (!loaded) return <p className="struk-pesan">Memuat…</p>;
  if (loaded.state === "VALID") {
    return (
      <div className="struk-halaman">
        <ReceiptPaper receipt={loaded.receipt} />
        <p className="struk-tengah struk-tanpa-cetak">
          <button type="button" className="struk-tombol" onClick={() => window.print()}>
            Cetak
          </button>
        </p>
      </div>
    );
  }
  const text = loaded.state === "CANCELLED" ? RECEIPT_CANCELLED_TEXT : loaded.state === "INVALID" ? RECEIPT_INVALID_TEXT : loaded.message;
  return (
    <p role="status" className="struk-pesan">
      {text}
    </p>
  );
}
