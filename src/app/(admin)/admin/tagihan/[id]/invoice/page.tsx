import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PrintButton } from "@/components/admin/billing/print-button";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { InvoiceA4Paper } from "@/components/receipt/invoice-a4-paper";
import { getInvoiceA4 } from "@/server/invoice-read";

export const metadata = { title: "Invoice A4" };

/** Cetak invoice A4 dari panel (spec invoice A4 IA8): tagihan final atau dibatalkan (cap DIBATALKAN, IA9). */
export default async function InvoiceA4Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoiceA4(id);
  if (!invoice) notFound();

  return (
    <>
      <div className="print:hidden">
        <AdminHeader title="Tagihan" />
      </div>
      <PageBody>
        <div className="print:hidden">
          <PageHeader
            title="Invoice A4"
            trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: invoice.customerName, href: `/admin/tagihan/${id}` }, { label: "Invoice A4" }]}
            actions={<PrintButton />}
          />
        </div>
        <InvoiceA4Paper invoice={invoice} />
      </PageBody>
    </>
  );
}
