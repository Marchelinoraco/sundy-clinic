import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { PatientPackageTable } from "@/components/admin/package/patient-package-table";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { resolveTab } from "@/lib/page-tabs";
import { can } from "@/lib/permissions";
import { searchPatientPackages } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";
import { listPackageServices, listTreatmentPackages } from "@/server/treatment-package-catalog";

export const metadata = { title: "Paket" };

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; cari?: string | string[] }> }) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const canCatalog = can(staff.role, "price:manage");
  const tabs = [
    { id: "customer", label: "Paket customer", href: "/admin/paket" },
    ...(canCatalog ? [{ id: "katalog", label: "Katalog paket", href: "/admin/paket?tab=katalog" }] : []),
  ];
  const active = resolveTab(params.tab, tabs.map((tab) => tab.id));
  const q = typeof params.cari === "string" ? params.cari : "";

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader title="Paket treatment" description="Paket yang dibeli customer dan sisa sesinya, serta katalog paket." />
        <PageTabs label="Bagian paket" active={active} tabs={tabs} />
        {active === "customer" && (
          <>
            <Form action="/admin/paket" aria-label="Cari paket">
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <TextField
                  name="cari"
                  defaultValue={q}
                  placeholder="Cari customer, nomor RM, atau paket"
                  autoComplete="off"
                  slotProps={{ htmlInput: { "aria-label": "Cari customer, nomor RM, atau paket" } }}
                  sx={{ width: "100%", maxWidth: 320 }}
                />
                <Button type="submit" variant="outlined">
                  Cari
                </Button>
              </Stack>
            </Form>
            <SectionCard title="Paket customer" flush>
              <PatientPackageTable rows={await searchPatientPackages(q)} />
            </SectionCard>
          </>
        )}
        {active === "katalog" && canCatalog && <TreatmentPackageCatalog packages={await listTreatmentPackages()} services={await listPackageServices()} />}
      </PageBody>
    </>
  );
}
