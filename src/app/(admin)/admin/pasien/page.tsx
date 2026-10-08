import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { AdminHeader } from "@/components/admin/admin-header";
import { NewPatientForm } from "@/components/admin/new-patient-form";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PATIENT_PROGRAM_LABEL } from "@/components/admin/patient-detail-view";
import { PatientTable } from "@/components/admin/patient-table";
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
            <Box component="form" action="/admin/pasien" role="search" sx={{ display: "flex", gap: 1, width: { xs: "100%", sm: "auto" } }}>
              <TextField
                name="q"
                defaultValue={query}
                placeholder="Cari nama, WhatsApp, atau No. RM"
                slotProps={{
                  htmlInput: { "aria-label": "Cari pasien" },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ width: { xs: "100%", sm: 288 } }}
              />
              <Button type="submit" variant="outlined" size="small">
                Cari
              </Button>
            </Box>
          }
        >
          <PatientTable
            patients={patients.map((p) => ({ ...p, programLabel: PATIENT_PROGRAM_LABEL[p.programStatus] }))}
            emptyText={query ? `Tidak ada pasien yang cocok dengan “${query}”.` : "Belum ada pasien."}
          />
        </SectionCard>
      </PageBody>
    </>
  );
}
