import type { Metadata } from "next";
import { ReceiptEntry } from "@/components/receipt/receipt-entry";

export const metadata: Metadata = {
  title: "Struk",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec struk WA 4, 6). */
export default function ReceiptPage() {
  return <ReceiptEntry />;
}
