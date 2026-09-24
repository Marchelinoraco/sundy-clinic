import { AdminHeader } from "@/components/admin/admin-header";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRecentPatients, searchPatients } from "@/server/patient";
import { requireCapability } from "@/server/session";

const PROGRAM_STATUS_LABEL: Record<string, string> = {
  AKTIF: "Aktif",
  SELESAI: "Selesai",
  TIDAK_AKTIF: "Tidak aktif",
};

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCapability("booking:manage");
  const { q = "" } = await searchParams;
  const query = q.trim();

  const patients = query ? await searchPatients(query) : await listRecentPatients();

  return (
    <>
      <AdminHeader title="Pasien" />
      <div className="space-y-6 p-6">
        <form action="/admin/pasien" className="flex flex-wrap gap-2" role="search">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Cari nama, WhatsApp, atau No. RM"
            aria-label="Cari pasien"
            className="w-full sm:w-80"
          />
          <Button type="submit" variant="outline">
            Cari
          </Button>
        </form>

        <NewPatientForm />

        <section className="space-y-2">
          <h2 className="text-sm text-muted-foreground">
            {query ? `Hasil pencarian “${query}”` : "Pasien terbaru"}
          </h2>
          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {query ? "Tidak ada pasien yang cocok." : "Belum ada pasien terdaftar."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. RM</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Status Program</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.medicalRecordNumber}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.whatsapp}</TableCell>
                    <TableCell>{PROGRAM_STATUS_LABEL[p.programStatus] ?? p.programStatus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
