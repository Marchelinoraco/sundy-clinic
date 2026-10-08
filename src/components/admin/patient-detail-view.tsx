import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { AppointmentStatusBadge } from "@/components/admin/appointment-status-badge";
import { formatIndonesianDate } from "@/lib/format";
import { resolveTab } from "@/lib/page-tabs";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientDetail } from "@/server/patient";
import { FoodRecallTable } from "./food-recall-table";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";
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
    <Box sx={wide ? { gridColumn: { sm: "span 2" } } : undefined}>
      <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0 }}>
        {value ?? "—"}
      </Box>
    </Box>
  );
}

const MONO = { fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" } as const;
const SUBHEAD = { fontSize: "0.75rem", fontWeight: 400, color: "text.secondary" } as const;

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {patient.mergedInto && (
        <Alert severity="warning">
          Pasien ini rangkap dari{" "}
          <TextLink href={`/admin/pasien/${patient.mergedInto.id}`} underline="always">
            {patient.mergedInto.name} ({patient.mergedInto.medicalRecordNumber})
          </TextLink>
          . Booking dan isiannya sudah dipindah ke sana.
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" } }}>
        <SectionCard title="Data diri">
          <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.5, fontSize: "0.875rem", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            <Field label="WhatsApp" value={patient.whatsapp} />
            <Field label="Tanggal lahir" value={birth} />
            <Field label="Jenis kelamin" value={patient.genderLabel} />
            <Field label="Pekerjaan" value={patient.occupation} />
            <Field label="Alamat" value={patient.address} wide />
          </Box>
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider", display: "grid", gap: 1.5, fontSize: "0.875rem", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            <NikForm patientId={patient.id} nik={patient.nik} missingReason={patient.nikMissingReason} />
            <PaperRecordNumberForm patientId={patient.id} value={patient.paperRecordNumber} />
          </Box>
        </SectionCard>

        {patient.record && (
          <SectionCard title="Catatan medis" description="Diisi dokter lewat tombol “Setujui ke data pasien” di halaman isian.">
            <Box sx={{ display: "grid", gap: 2, fontSize: "0.875rem", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
              <div>
                <Typography component="h3" sx={SUBHEAD}>
                  Alergi
                </Typography>
                {patient.record.allergies ? (
                  <Box
                    component="p"
                    data-allergy="true"
                    sx={{ mt: 0.5, mb: 0, display: "inline-block", whiteSpace: "pre-line", borderRadius: 1.5, px: 1, py: 0.5, fontWeight: 500, color: "error.main", bgcolor: "rgba(var(--mui-palette-error-mainChannel) / 0.1)" }}
                  >
                    {patient.record.allergies}
                  </Box>
                ) : (
                  <Box component="p" sx={{ m: 0 }}>
                    Belum ada
                  </Box>
                )}
              </div>
              <div>
                <Typography component="h3" sx={SUBHEAD}>
                  Riwayat penyakit & obat
                </Typography>
                <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
                  {patient.record.medicalHistory ?? "Belum ada"}
                </Box>
              </div>
            </Box>
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider", fontSize: "0.875rem" }}>
              {canWriteRecords ? (
                <ImportantNotesForm patientId={patient.id} value={patient.record.importantNotes} />
              ) : (
                <div>
                  <Typography component="h3" sx={SUBHEAD}>
                    Catatan penting
                  </Typography>
                  <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
                    {patient.record.importantNotes ?? "Belum ada"}
                  </Box>
                </div>
              )}
            </Box>
          </SectionCard>
        )}
      </Box>

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
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tanggal</TableCell>
                    <TableCell>Cabang</TableCell>
                    <TableCell>Penulis</TableCell>
                    <TableCell>Penilaian</TableCell>
                    <TableCell>Food recall</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {patient.encounters.map((encounter) => (
                    <TableRow key={encounter.id}>
                      <TableCell>{when(encounter.startAt)}</TableCell>
                      <TableCell>{encounter.branchName}</TableCell>
                      <TableCell>{encounter.authorName}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>{encounter.assessmentPreview ?? "—"}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>
                        {encounter.foodRecall && encounter.foodRecall.entries.length > 0 ? (
                          <details>
                            <Box component="summary" sx={{ cursor: "pointer", fontSize: "0.875rem" }}>
                              Food recall {encounter.foodRecall.recallDateLabel}
                            </Box>
                            <FoodRecallTable entries={encounter.foodRecall.entries} label={`Food recall ${encounter.foodRecall.recallDateLabel}`} />
                          </details>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusChip label={encounter.status === "FINAL" ? "Final" : "Draf"} tone={encounter.status === "FINAL" ? "success" : "neutral"} />
                      </TableCell>
                      <TableCell>
                        <TextLink href={`/admin/kunjungan/${encounter.id}`} underline="always">
                          Buka
                        </TextLink>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      )}

      {active === "booking" && (
        <SectionCard title="Riwayat booking" flush>
          {patient.appointments.length === 0 ? (
            <EmptyState>Belum ada booking.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Jadwal</TableCell>
                    <TableCell>Kode</TableCell>
                    <TableCell>Layanan</TableCell>
                    <TableCell>Tenaga</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {patient.appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{when(a.startAt)}</TableCell>
                      <TableCell sx={MONO}>{a.code}</TableCell>
                      <TableCell>{a.serviceName}</TableCell>
                      <TableCell>
                        <div>{a.staffName}</div>
                        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                          {a.branchName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      )}

      {active === "isian" && (
        <SectionCard title="Riwayat isian" flush>
          {patient.intakes.length === 0 ? (
            <EmptyState>Belum ada isian.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Dikirim</TableCell>
                    <TableCell>Booking</TableCell>
                    <TableCell>Kuis</TableCell>
                    <TableCell>Status</TableCell>
                    {canReadRecords && <TableCell>Aksi</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {patient.intakes.map((intake) => (
                    <TableRow key={intake.id}>
                      <TableCell>{intake.submittedAt ? formatIndonesianDate(intake.submittedAt) : "—"}</TableCell>
                      <TableCell sx={MONO}>{intake.code}</TableCell>
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
                          <TextLink href={`/admin/isian/${intake.id}`} underline="always">
                            Lihat isian
                          </TextLink>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      )}
    </Box>
  );
}
