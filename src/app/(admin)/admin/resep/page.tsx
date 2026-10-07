import { AdminHeader } from "@/components/admin/admin-header";
import { DispensingTable } from "@/components/admin/dispensing/dispensing-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { DISPENSING_STATUS_LABEL, DISPENSING_VIEWS, isDispensingView, type DispensingView } from "@/lib/dispensing";
import { listDispensings } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Resep" };

export default async function DispensingPage({ searchParams }: { searchParams: Promise<{ lihat?: string }> }) {
  await requireCapability("dispense:read");
  const params = await searchParams;
  const view: DispensingView = isDispensingView(params.lihat) ? params.lihat : "MENUNGGU";
  const rows = await listDispensings({ view });

  return (
    <>
      <AdminHeader title="Resep" />
      <PageBody>
        <PageHeader title="Resep" description="Obat yang perlu diserahkan, dari catatan dokter untuk Apoteker." />
        <PageTabs
          label="Tampilan resep"
          active={view}
          tabs={DISPENSING_VIEWS.map((value) => ({
            id: value,
            label: DISPENSING_STATUS_LABEL[value],
            href: value === "MENUNGGU" ? "/admin/resep" : `/admin/resep?lihat=${value}`,
          }))}
        />
        <SectionCard title={DISPENSING_STATUS_LABEL[view]} flush>
          <DispensingTable rows={rows} />
        </SectionCard>
      </PageBody>
    </>
  );
}
