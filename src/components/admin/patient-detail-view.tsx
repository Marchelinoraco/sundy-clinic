import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/admin/appointment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { resolveTab } from "@/lib/page-tabs";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientDetail } from "@/server/patient";
import { FoodRecallTable } from "./food-recall-table";
import { NikForm } from "./nik-form";
import { EmptyState, SectionCard } from "./page-layout";
import { PageTabs } from "./page-tabs";
import { ImportantNotesForm, PaperRecordNumberForm } from "./patient-note-forms";

export const PATIENT_PROGRAM_LABEL: Record<PatientDetail["programStatus"], string> = {
  AKTIF: "Program aktif",
  SELESAI: "Program selesai",
  TIDAK_AKTIF: "Tidak aktif",
};

const INTAKE_STATUS_LABEL: Record<PatientDetail["intakes"][number]["status"], string> = {
  MENUNGGU_DIISI: "Belum diisi",
  TERISI: "Belum diperiksa",
  DIPERIKSA: "Diperiksa",
};

type PatientTab = "kunjungan" | "booking" | "isian";

const when = (date: Date) => `${formatIndonesianDate(date)}, ${minutesToTimeLabel(witaMinutesOfDay(date))}`;

function Field({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

/** Data Pasien (spec D 5.3): dua kartu berdampingan, lalu riwayat dalam tab `?tab=`. */
export function PatientDetailView({
  patient,
  canReadRecords,
  canWriteRecords,
  tab,
}: {
  patient: PatientDetail;
  canReadRecords: boolean;
  canWriteRecords: boolean;
  tab?: string;
}) {
  const tabs: PatientTab[] = patient.encounters ? ["kunjungan", "booking", "isian"] : ["booking", "isian"];
  const active = resolveTab(tab, tabs, patient.encounters && patient.encounters.length > 0 ? "kunjungan" : "booking");
  const href = (id: PatientTab) => `/admin/pasien/${patient.id}?tab=${id}`;
  const birth = patient.birthDateLabel
    ? `${patient.birthDateLabel}${patient.ageYears !== null ? ` (${patient.ageYears} tahun)` : ""}`
    : null;

  return (
    <div className="space-y-6">
      {patient.mergedInto && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pasien ini rangkap dari{" "}
          <Link href={`/admin/pasien/${patient.mergedInto.id}`} className="font-medium underline underline-offset-4">
            {patient.mergedInto.name} ({patient.mergedInto.medicalRecordNumber})
          </Link>
          . Booking dan isiannya sudah dipindah ke sana.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Data diri">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="WhatsApp" value={patient.whatsapp} />
            <Field label="Tanggal lahir" value={birth} />
            <Field label="Jenis kelamin" value={patient.genderLabel} />
            <Field label="Pekerjaan" value={patient.occupation} />
            <Field label="Alamat" value={patient.address} wide />
          </dl>
          <div className="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
            <NikForm patientId={patient.id} nik={patient.nik} missingReason={patient.nikMissingReason} />
            <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
          </div>
        </SectionCard>

        {patient.record && (
          <SectionCard title="Catatan medis" description="Diisi dokter lewat tombol “Setujui ke data pasien” di halaman isian.">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="text-xs text-muted-foreground">Alergi</h3>
                {patient.record.allergies ? (
                  <p data-allergy="true" className="mt-1 inline-block whitespace-pre-line rounded-md bg-red-50 px-2 py-1 font-medium text-red-800">
                    {patient.record.allergies}
                  </p>
                ) : (
                  <p>Belum ada</p>
                )}
              </div>
              <div>
                <h3 className="text-xs text-muted-foreground">Riwayat penyakit & obat</h3>
                <p className="whitespace-pre-line">{patient.record.medicalHistory ?? "Belum ada"}</p>
              </div>
            </div>
            <div className="mt-3 border-t pt-3 text-sm">
              {canWriteRecords ? (
                <ImportantNotesForm patientId={patient.id} value={patient.record.importantNotes} />
              ) : (
                <div>
                  <h3 className="text-xs text-muted-foreground">Catatan penting</h3>
                  <p className="whitespace-pre-line">{patient.record.importantNotes ?? "Belum ada"}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      <PageTabs
        label="Riwayat pasien"
        active={active}
        tabs={[
          ...(patient.encounters ? [{ id: "kunjungan", label: `Kunjungan (${patient.encounters.length})`, href: href("kunjungan") }] : []),
          { id: "booking", label: `Booking (${patient.appointments.length})`, href: href("booking") },
          { id: "isian", label: `Isian (${patient.intakes.length})`, href: href("isian") },
        ]}
      />

      {active === "kunjungan" && patient.encounters && (
        <SectionCard title="Riwayat kunjungan" flush>
          {patient.encounters.length === 0 ? (
            <EmptyState>Belum ada kunjungan yang diperiksa.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Penulis</TableHead>
                  <TableHead>Penilaian</TableHead>
                  <TableHead>Food recall</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.encounters.map((encounter) => (
                  <TableRow key={encounter.id}>
                    <TableCell>{when(encounter.startAt)}</TableCell>
                    <TableCell>{encounter.branchName}</TableCell>
                    <TableCell>{encounter.authorName}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{encounter.assessmentPreview ?? "—"}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      {encounter.foodRecall && encounter.foodRecall.entries.length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-sm">Food recall {encounter.foodRecall.recallDateLabel}</summary>
                          <FoodRecallTable
                            entries={encounter.foodRecall.entries}
                            label={`Food recall ${encounter.foodRecall.recallDateLabel}`}
                          />
                        </details>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={encounter.status === "FINAL" ? "default" : "outline"}>
                        {encounter.status === "FINAL" ? "Final" : "Draf"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/kunjungan/${encounter.id}`} className="text-sm underline underline-offset-4">
                        Buka
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}

      {active === "booking" && (
        <SectionCard title="Riwayat booking" flush>
          {patient.appointments.length === 0 ? (
            <EmptyState>Belum ada booking.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Tenaga</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{when(a.startAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell>{a.serviceName}</TableCell>
                    <TableCell>
                      <div>{a.staffName}</div>
                      <div className="text-xs text-muted-foreground">{a.branchName}</div>
                    </TableCell>
                    <TableCell>
                      <AppointmentStatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}

      {active === "isian" && (
        <SectionCard title="Riwayat isian" flush>
          {patient.intakes.length === 0 ? (
            <EmptyState>Belum ada isian.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dikirim</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Kuis</TableHead>
                  <TableHead>Status</TableHead>
                  {canReadRecords && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.intakes.map((intake) => (
                  <TableRow key={intake.id}>
                    <TableCell>{intake.submittedAt ? formatIndonesianDate(intake.submittedAt) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{intake.code}</TableCell>
                    <TableCell>
                      {intake.kind === "LENGKAP" ? "Lengkap" : "Pendek"}
                      {intake.purposeLabel ? ` · ${intake.purposeLabel}` : ""}
                    </TableCell>
                    <TableCell>
                      {INTAKE_STATUS_LABEL[intake.status]}
                      {intake.reviewerName ? ` · ${intake.reviewerName}` : ""}
                    </TableCell>
                    {canReadRecords && (
                      <TableCell>
                        <Link href={`/admin/isian/${intake.id}`} className="text-sm underline underline-offset-4">
                          Lihat isian
                        </Link>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
