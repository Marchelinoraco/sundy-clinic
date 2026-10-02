import Link from "next/link";
import { Search } from "lucide-react";
import { AdminHeader } from "@/components/admin/admin-header";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PATIENT_PROGRAM_LABEL } from "@/components/admin/patient-detail-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { countPatients, listRecentPatients, searchPatients } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCapability("booking:manage");
  const { q = "" } = await searchParams;
  const query = q.trim();
  const [patients, total] = await Promise.all([query ? searchPatients(query) : listRecentPatients(), countPatients()]);

  return (
    <>
      <AdminHeader title="Pasien" />
      <PageBody>
        <PageHeader title="Pasien" description={`${total} pasien`} actions={<NewPatientForm />} />
        <SectionCard
          title={query ? `Hasil untuk “${query}”` : "Pasien terbaru"}
          flush
          actions={
            <form action="/admin/pasien" role="search" className="flex gap-2">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Cari nama, WhatsApp, atau No. RM"
                  aria-label="Cari pasien"
                  className="w-full pl-8 sm:w-72"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-9">
                Cari
              </Button>
            </form>
          }
        >
          {patients.length === 0 ? (
            <EmptyState>{query ? `Tidak ada pasien yang cocok dengan “${query}”.` : "Belum ada pasien."}</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. RM</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Kunjungan terakhir</TableHead>
                  <TableHead>Booking berikutnya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.medicalRecordNumber}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/admin/pasien/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.whatsapp}</TableCell>
                    <TableCell>
                      <Badge variant={p.programStatus === "AKTIF" ? "default" : "outline"}>{PATIENT_PROGRAM_LABEL[p.programStatus]}</Badge>
                    </TableCell>
                    <TableCell>{p.lastVisitAt ? formatDateWithYear(p.lastVisitAt) : "—"}</TableCell>
                    <TableCell>
                      {p.nextBookingAt
                        ? `${formatShortIndonesianDate(p.nextBookingAt)} · ${minutesToTimeLabel(witaMinutesOfDay(p.nextBookingAt))}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
