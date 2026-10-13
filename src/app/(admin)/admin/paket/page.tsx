import { AdminHeader } from "@/components/admin/admin-header";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { listPackageServices, listTreatmentPackages } from "@/server/treatment-package-catalog";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Paket" };

export default async function PackagesPage() {
  await requireCapability("price:manage");
  const [packages, services] = await Promise.all([listTreatmentPackages(), listPackageServices()]);
  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader title="Paket treatment" description="Katalog paket dan paket yang sudah dibeli customer." />
        <PageTabs label="Bagian paket" active="katalog" tabs={[{ id: "katalog", label: "Katalog paket", href: "/admin/paket?tab=katalog" }]} />
        <TreatmentPackageCatalog packages={packages} services={services} />
      </PageBody>
    </>
  );
}
