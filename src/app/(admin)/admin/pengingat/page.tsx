import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { LinkButton } from "@/components/admin/mui/links";
import { SelectField } from "@/components/admin/mui/select-field";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { ReminderWorklistView } from "@/components/admin/reminder-worklist";
import { TreatmentPatientTable } from "@/components/admin/treatment-patient-table";
import { resolveTab } from "@/lib/page-tabs";
import { getReminderWorklist } from "@/server/reminder";
import { requireCapability } from "@/server/session";
import { listTreatmentPatients, OLDER_THAN_WEEKS } from "@/server/treatment-patients-read";

export const metadata = { title: "Pengingat" };

type Params = { tab?: string | string[]; cari?: string | string[]; lebih?: string | string[]; hal?: string | string[] };
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function ReminderPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCapability("booking:manage");
  const params = await searchParams;
  const tabs = [
    { id: "hari-ini", label: "Hari ini", href: "/admin/pengingat" },
    { id: "pasien-treatment", label: "Pasien treatment", href: "/admin/pengingat?tab=pasien-treatment" },
  ];
  const active = resolveTab(params.tab, tabs.map((tab) => tab.id));

  return (
    <>
      <AdminHeader title="Pengingat" />
      <PageBody>
        <PageHeader title="Pengingat" description="Konfirmasi, pengingat H-1, dan ajakan treatment lagi lewat WhatsApp." />
        <PageTabs label="Bagian pengingat" active={active} tabs={tabs} />
        {active === "hari-ini" && <ReminderWorklistView worklist={await getReminderWorklist()} />}
        {active === "pasien-treatment" && <TreatmentPatients q={one(params.cari)} weeks={one(params.lebih)} page={one(params.hal)} />}
      </PageBody>
    </>
  );
}

/** Tab "Pasien treatment" (spec pengingat treatment PT10): cari, saring, dan kirim ulang satu per satu. */
async function TreatmentPatients({ q, weeks, page }: { q: string; weeks: string; page: string }) {
  const result = await listTreatmentPatients({ q, olderThanWeeks: Number(weeks) || undefined, page: Number(page) || 1 });
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (target: number) => {
    const query = new URLSearchParams({ tab: "pasien-treatment", ...(q ? { cari: q } : {}), ...(weeks ? { lebih: weeks } : {}), hal: String(target) });
    return `/admin/pengingat?${query.toString()}`;
  };

  return (
    <>
      <Form action="/admin/pengingat" aria-label="Cari pasien treatment">
        <input type="hidden" name="tab" value="pasien-treatment" />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            name="cari"
            defaultValue={q}
            placeholder="Cari nama pasien atau treatment"
            autoComplete="off"
            slotProps={{ htmlInput: { "aria-label": "Cari nama pasien atau treatment" } }}
            sx={{ width: "100%", maxWidth: 320 }}
          />
          <SelectField name="lebih" aria-label="Treatment terakhir" defaultValue={weeks} fullWidth={false} sx={{ minWidth: 260 }}>
            <option value="">Treatment terakhir: kapan saja</option>
            {OLDER_THAN_WEEKS.map((value) => (
              <option key={value} value={String(value)}>
                Treatment terakhir lebih dari {value} minggu lalu
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="outlined">
            Cari
          </Button>
        </Stack>
      </Form>
      <SectionCard title="Pasien treatment" description={`${result.total} pasien`} flush>
        <TreatmentPatientTable rows={result.rows} />
      </SectionCard>
      {lastPage > 1 && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
          {result.page > 1 && (
            <LinkButton href={href(result.page - 1)} variant="outlined" size="small">
              Sebelumnya
            </LinkButton>
          )}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Halaman {result.page} dari {lastPage}
          </Typography>
          {result.page < lastPage && (
            <LinkButton href={href(result.page + 1)} variant="outlined" size="small">
              Berikutnya
            </LinkButton>
          )}
        </Stack>
      )}
    </>
  );
}
