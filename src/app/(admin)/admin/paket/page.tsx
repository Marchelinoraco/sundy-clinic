import Button from "@mui/material/Button";
import Link from "next/link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { LegacyPackageDialog } from "@/components/admin/package/legacy-package-dialog";
import { PatientPackageTable } from "@/components/admin/package/patient-package-table";
import { TreatmentPackageCatalog } from "@/components/admin/package/treatment-package-catalog";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { resolveTab } from "@/lib/page-tabs";
import { can } from "@/lib/permissions";
import { witaDateString } from "@/lib/time";
import { listLegacyCatalog } from "@/server/legacy-package-read";
import { searchPatientPackages } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";
import { listPackageServices, listPackageStockItems, listTreatmentPackages } from "@/server/treatment-package-catalog";

export const metadata = { title: "Paket" };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; cari?: string | string[]; asal?: string | string[] }>;
}) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const canCatalog = can(staff.role, "price:manage");
  const tabs = [
    { id: "customer", label: "Paket customer", href: "/admin/paket" },
    ...(canCatalog ? [{ id: "katalog", label: "Katalog paket", href: "/admin/paket?tab=katalog" }] : []),
  ];
  const active = resolveTab(params.tab, tabs.map((tab) => tab.id));
  const q = typeof params.cari === "string" ? params.cari : "";
  // Saringan "Paket lama (Kluto)" untuk pencocokan dengan Kluto (spec paket lama PL12); tombol memasukkan untuk invoice:manage (PL2).
  const legacyOnly = params.asal === "kluto";
  const canEnterLegacy = can(staff.role, "invoice:manage");
  const filterHref = (kluto: boolean) => {
    const query = new URLSearchParams({ ...(q ? { cari: q } : {}), ...(kluto ? { asal: "kluto" } : {}) }).toString();
    return query ? `/admin/paket?${query}` : "/admin/paket";
  };

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader title="Paket treatment" description="Paket yang dibeli customer dan sisa sesi atau barangnya, serta katalog paket." />
        <PageTabs label="Bagian paket" active={active} tabs={tabs} />
        {active === "customer" && (
          <>
            <Form action="/admin/paket" aria-label="Cari paket">
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                {legacyOnly && <input type="hidden" name="asal" value="kluto" />}
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
                {canEnterLegacy && <LegacyPackageDialog catalog={await listLegacyCatalog()} today={witaDateString(new Date())} />}
              </Stack>
            </Form>
            <Stack direction="row" spacing={1} role="group" aria-label="Saring asal paket">
              <Button component={Link} href={filterHref(false)} size="small" variant={legacyOnly ? "outlined" : "contained"} aria-current={legacyOnly ? undefined : "true"}>
                Semua
              </Button>
              <Button component={Link} href={filterHref(true)} size="small" variant={legacyOnly ? "contained" : "outlined"} aria-current={legacyOnly ? "true" : undefined}>
                Paket lama (Kluto)
              </Button>
            </Stack>
            <SectionCard title="Paket customer" flush>
              <PatientPackageTable rows={await searchPatientPackages(q, legacyOnly ? { source: "KLUTO" } : undefined)} />
            </SectionCard>
          </>
        )}
        {active === "katalog" && canCatalog && (
          <TreatmentPackageCatalog packages={await listTreatmentPackages()} services={await listPackageServices()} stockItems={await listPackageStockItems()} />
        )}
      </PageBody>
    </>
  );
}
