import Typography from "@mui/material/Typography";
import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicConsultationCard } from "@/components/admin/clinic-consultation-card";
import { OnlineServiceCard } from "@/components/admin/online-service-card";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { InternalServiceDialog } from "@/components/admin/service/internal-service-dialog";
import { ServicePriceTable } from "@/components/admin/service-price-table";
import { can } from "@/lib/permissions";
import { getInternalCatalog, getSiteCatalog, listServiceCategories } from "@/server/catalog-admin-read";
import { getClinicConsultationMinutes, getOnlineServiceSettings } from "@/server/service-admin";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Layanan & Harga" };

type Tab = "internal" | "situs";

export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Katalog internal dan situs dikelola Super Admin dan Admin Keuangan; kartu konsultasi tetap Super Admin (spec layanan situs 5).
  const staff = await requireCapability("catalog:manage");
  const canContent = can(staff.role, "content:manage");
  const tab: Tab = (await searchParams).tab === "situs" ? "situs" : "internal";
  const [internal, categoryOptions] = await Promise.all([getInternalCatalog(), listServiceCategories()]);

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <PageBody>
        <PageHeader
          title="Layanan & Harga"
          description="Katalog internal dipakai booking, tagihan, dan paket. Katalog situs adalah isi promosi yang tertaut ke layanan internal."
          actions={tab === "internal" ? <InternalServiceDialog categories={categoryOptions} /> : undefined}
        />
        <PageTabs
          label="Katalog layanan"
          active={tab}
          tabs={[
            { id: "internal", label: "Layanan internal", href: "/admin/layanan" },
            { id: "situs", label: "Layanan situs", href: "/admin/layanan?tab=situs" },
          ]}
        />
        {tab === "internal" ? (
          <InternalTab canContent={canContent} internal={internal} categoryOptions={categoryOptions} />
        ) : (
          <SiteTab />
        )}
      </PageBody>
    </>
  );
}

async function InternalTab({
  canContent,
  internal,
  categoryOptions,
}: {
  canContent: boolean;
  internal: Awaited<ReturnType<typeof getInternalCatalog>>;
  categoryOptions: { id: string; name: string }[];
}) {
  const [online, consultationMinutes] = await Promise.all([
    canContent ? getOnlineServiceSettings() : Promise.resolve(null),
    canContent ? getClinicConsultationMinutes() : Promise.resolve(null),
  ]);
  return (
    <>
      {consultationMinutes !== null && <ClinicConsultationCard minutes={consultationMinutes} />}
      {online && <OnlineServiceCard settings={online} />}
      <ServicePriceTable categories={internal} categoryOptions={categoryOptions} />
    </>
  );
}

async function SiteTab() {
  const site = await getSiteCatalog();
  if (site.length === 0) return <EmptyState>Belum ada layanan situs.</EmptyState>;
  return (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      Daftar layanan situs menyusul.
    </Typography>
  );
}
