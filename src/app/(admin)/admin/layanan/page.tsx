import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicConsultationCard } from "@/components/admin/clinic-consultation-card";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { can } from "@/lib/permissions";
import { getInternalCatalog } from "@/server/catalog-admin-read";
import { getClinicConsultationMinutes, getOnlineServiceSettings } from "@/server/service-admin";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  // Katalog internal dan situs dikelola Super Admin dan Admin Keuangan; kartu konsultasi tetap Super Admin (spec layanan situs 5).
  const staff = await requireCapability("catalog:manage");
  const canContent = can(staff.role, "content:manage");
  const [categories, online, consultationMinutes] = await Promise.all([
    getInternalCatalog(),
    canContent ? getOnlineServiceSettings() : Promise.resolve(null),
    canContent ? getClinicConsultationMinutes() : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader title="Layanan & Harga" description="Perubahan harga langsung tampil di situs publik dan tercatat di jejak audit." />
        {consultationMinutes !== null && <ClinicConsultationCard minutes={consultationMinutes} />}
        {online && <OnlineServiceCard settings={online} />}
        <ServicePriceTable
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            services: category.services.map((s) => ({
              id: s.id,
              name: s.name,
              normalPrice: s.normalPrice,
              promoPrice: s.promoPrice,
              materialCost: s.materialCost,
              toolCost: s.toolCost,
              commissionKind: s.commissionKind,
              commissionValue: s.commissionValue,
            })),
          }))}
        />
      </PageBody>
    </>
  );
}
