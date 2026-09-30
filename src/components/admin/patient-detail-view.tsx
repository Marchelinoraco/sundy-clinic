import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/admin/appointment-status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientDetail } from "@/server/patient";
import { ImportantNotesForm, PaperRecordNumberForm } from "./patient-note-forms";

const PROGRAM_STATUS_LABEL: Record<PatientDetail["programStatus"], string> = {
  AKTIF: "Aktif",
  SELESAI: "Selesai",
  TIDAK_AKTIF: "Tidak aktif",
};

const INTAKE_STATUS_LABEL: Record<PatientDetail["intakes"][number]["status"], string> = {
  MENUNGGU_DIISI: "Belum diisi",
  TERISI: "Belum diperiksa",
  DIPERIKSA: "Diperiksa",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export function PatientDetailView({
  patient,
  canReadRecords,
  canWriteRecords,
}: {
  patient: PatientDetail;
  canReadRecords: boolean;
  canWriteRecords: boolean;
}) {
  return (
    <div className="max-w-4xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{patient.name}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Field label="No. RM" value={patient.medicalRecordNumber} />
          <Field label="WhatsApp" value={patient.whatsapp} />
          <Field label="Tanggal lahir" value={patient.birthDateLabel} />
          <Field label="Jenis kelamin" value={patient.genderLabel} />
          <Field label="Pekerjaan" value={patient.occupation} />
          <Field label="Status program" value={PROGRAM_STATUS_LABEL[patient.programStatus]} />
          <Field label="Alamat" value={patient.address} />
        </dl>
        <div className="text-sm">
          <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
        </div>
      </section>

      {patient.record && (
        <section aria-labelledby="catatan-medis" className="space-y-3 rounded-lg border p-4">
          <h2 id="catatan-medis" className="text-base font-medium">
            Catatan medis
          </h2>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="text-xs text-muted-foreground">Alergi</h3>
              <p className="whitespace-pre-line">{patient.record.allergies ?? "Belum ada"}</p>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground">Riwayat penyakit & obat</h3>
              <p className="whitespace-pre-line">{patient.record.medicalHistory ?? "Belum ada"}</p>
            </div>
          </div>
          <div className="text-sm">
            {canWriteRecords ? (
              <ImportantNotesForm patientId={patient.id} value={patient.record.importantNotes} />
            ) : (
              <div>
                <h3 className="text-xs text-muted-foreground">Catatan penting</h3>
                <p className="whitespace-pre-line">{patient.record.importantNotes ?? "Belum ada"}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Diisi dokter lewat tombol “Setujui ke data pasien” di halaman isian.
          </p>
        </section>
      )}

      {patient.encounters && (
        <section aria-labelledby="riwayat-kunjungan" className="space-y-2">
          <h2 id="riwayat-kunjungan" className="text-base font-medium">
            Riwayat kunjungan
          </h2>
          {patient.encounters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kunjungan yang diperiksa.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Penulis</TableHead>
                  <TableHead>Penilaian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.encounters.map((encounter) => (
                  <TableRow key={encounter.id}>
                    <TableCell>
                      {formatIndonesianDate(encounter.startAt)}, {minutesToTimeLabel(witaMinutesOfDay(encounter.startAt))}
                    </TableCell>
                    <TableCell>{encounter.branchName}</TableCell>
                    <TableCell>{encounter.authorName}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{encounter.assessmentPreview ?? "—"}</TableCell>
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
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-medium">Riwayat booking</h2>
        {patient.appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada booking.</p>
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
                  <TableCell>
                    {formatIndonesianDate(a.startAt)}, {minutesToTimeLabel(witaMinutesOfDay(a.startAt))}
                  </TableCell>
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
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Riwayat isian</h2>
        {patient.intakes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada isian.</p>
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
      </section>
    </div>
  );
}
