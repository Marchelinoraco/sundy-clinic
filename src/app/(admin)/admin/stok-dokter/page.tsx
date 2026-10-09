import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { StockAvailabilityTable } from "@/components/admin/dispensing/stock-availability-table";
import { SelectField } from "@/components/admin/mui/select-field";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockAvailability } from "@/server/stock-availability";

export const metadata = { title: "Stok obat" };

export default async function StockAvailabilityPage({ searchParams }: { searchParams: Promise<{ cabang?: string; cari?: string }> }) {
  await requireCapability("stock:availability");
  const params = await searchParams;
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const q = params.cari?.trim() || undefined;

  return (
    <>
      <AdminHeader title="Stok obat" />
      <PageBody>
        <PageHeader title="Stok obat" description="Ketersediaan obat dan produk di cabang, untuk menulis catatan kunjungan." />
        {!branch ? (
          <EmptyState>Belum ada cabang aktif.</EmptyState>
        ) : (
          <>
            <Form action="/admin/stok-dokter">
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <SelectField name="cabang" defaultValue={branch.id} aria-label="Cabang" fullWidth={false} sx={{ minWidth: 180 }}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  name="cari"
                  defaultValue={q ?? ""}
                  placeholder="Cari nama atau kode"
                  autoComplete="off"
                  slotProps={{ htmlInput: { "aria-label": "Cari barang" } }}
                  sx={{ width: "100%", maxWidth: 320 }}
                />
                <Button type="submit" variant="outlined">
                  Cari
                </Button>
              </Stack>
            </Form>
            <SectionCard title={branch.name} flush>
              <StockAvailabilityTable rows={await listStockAvailability({ branchId: branch.id, q })} />
            </SectionCard>
          </>
        )}
      </PageBody>
    </>
  );
}
