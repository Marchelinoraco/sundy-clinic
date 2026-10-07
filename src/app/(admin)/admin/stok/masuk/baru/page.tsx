import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PurchaseForm } from "@/components/admin/stock/purchase-form";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockItemOptions, listSupplierOptions } from "@/server/stock-read";

export const metadata = { title: "Barang masuk" };

export default async function NewPurchasePage() {
  await requireCapability("stock:manage");
  const [items, suppliers, branches] = await Promise.all([listStockItemOptions(), listSupplierOptions(), getBranches()]);
  const active = branches.filter((branch) => branch.status === "AKTIF").map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title="Barang masuk"
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Barang masuk", href: "/admin/stok?tab=masuk" }, { label: "Baru" }]}
          description="Salin dari faktur kertas supplier. Hutang langsung tercatat dari total faktur."
        />
        {active.length === 0 ? (
          <EmptyState>Belum ada cabang aktif yang bisa menerima barang.</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>
            Belum ada barang aktif.{" "}
            <Link href="/admin/stok" className="underline underline-offset-4">
              Tambahkan barang dulu
            </Link>
            .
          </EmptyState>
        ) : (
          <PurchaseForm items={items} suppliers={suppliers} branches={active} today={witaDateString(new Date())} />
        )}
      </PageBody>
    </>
  );
}
