import type { Metadata } from "next";
import { InvoiceEntry } from "@/components/receipt/invoice-entry";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser, sama seperti /struk (spec invoice A4 IA8). */
export default function InvoicePage() {
  return <InvoiceEntry />;
}
