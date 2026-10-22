"use client";

import { useEffect, useState } from "react";
import type { PublicInvoicePage } from "@/lib/invoice-a4";
import { RECEIPT_CANCELLED_TEXT, RECEIPT_INVALID_TEXT } from "@/lib/receipt";
import { getPublicInvoice } from "@/server/invoice-a4-public";
import { InvoiceA4Paper } from "./invoice-a4-paper";

type Loaded = PublicInvoicePage | { state: "FAILED"; message: string } | null;

const LOAD_FAILED = "Invoice gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.";

/** Halaman /invoice (spec invoice A4 IA8): kode dibaca dari "#" seperti struk, lalu invoice dimuat lewat aksi server. */
export function InvoiceEntry() {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    setCode(code);
    if (!code) {
      setLoaded({ state: "INVALID" });
      return;
    }
    let current = true;
    getPublicInvoice(code)
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
      <div className="invoice-a4-halaman">
        <p className="struk-tengah invoice-a4-tanpa-cetak">
          <button type="button" className="struk-tombol" onClick={() => window.print()}>
            Cetak atau simpan PDF
          </button>{" "}
          <a className="struk-tombol" href={`/struk#${encodeURIComponent(code)}`}>
            Lihat struk
          </a>
        </p>
        <InvoiceA4Paper invoice={loaded.invoice} />
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
