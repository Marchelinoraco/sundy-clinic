import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { getServiceCategoriesWithServices } from "@/server/catalog";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  await requireCapability("content:manage");
  const categories = await getServiceCategoriesWithServices();

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader title="Layanan & Harga" description="Perubahan harga langsung tampil di situs publik dan tercatat di jejak audit." />
        <ServicePriceTable
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            services: category.services.map((s) => ({ id: s.id, name: s.name, normalPrice: s.normalPrice, promoPrice: s.promoPrice })),
          }))}
        />
      </PageBody>
    </>
  );
}
