"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveIntakeToPatient } from "@/server/intake";
import type { IntakeApproval } from "@/server/intake-clinical";

type ReadyApproval = Extract<IntakeApproval, { state: "ready" }>;

const COMPARE = { borderRadius: 1.5, bgcolor: "action.hover", p: 1 } as const;

function RecordField(props: {
  label: string;
  current: string | null;
  proposed: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box component="label" htmlFor={id} sx={{ fontSize: "1rem", fontWeight: 500 }}>
        {props.label}
      </Box>
      <Box sx={{ display: "grid", gap: 1, fontSize: "0.875rem", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
        <Box sx={COMPARE}>
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            Data pasien saat ini
          </Typography>
          <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
            {props.current || "(kosong)"}
          </Box>
        </Box>
        <Box sx={COMPARE}>
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            Usulan dari isian
          </Typography>
          <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
            {props.proposed || "(tidak ada di isian ini)"}
          </Box>
        </Box>
      </Box>
      <TextField
        id={id}
        multiline
        minRows={4}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        fullWidth
      />
    </Box>
  );
}

/** Dokter menyunting lalu menyetujui; isinya menggantikan catatan pasien (spec 6.4). */
export function IntakeApprovalForm({ intakeId, approval }: { intakeId: string; approval: ReadyApproval }) {
  const router = useRouter();
  const [allergies, setAllergies] = useState(approval.prefill.allergies);
  const [medicalHistory, setMedicalHistory] = useState(approval.prefill.medicalHistory);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      try {
        const result = await approveIntakeToPatient({
          intakeId,
          allergies,
          medicalHistory,
          patientVersion: approval.patientVersion,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Data pasien diperbarui.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Paper component="section" variant="outlined" aria-labelledby="setujui-data-pasien" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <div>
        <Typography component="h2" id="setujui-data-pasien" sx={{ fontSize: "1rem", fontWeight: 500 }}>
          Setujui ke data pasien
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Isi kedua kolom di bawah menggantikan catatan alergi dan riwayat penyakit pasien. Jawaban pasien di
          isian ini tidak berubah.
        </Typography>
      </div>
      <RecordField
        label="Alergi"
        current={approval.current.allergies}
        proposed={approval.proposed.allergies}
        value={allergies}
        onChange={setAllergies}
      />
      <RecordField
        label="Riwayat penyakit & obat"
        current={approval.current.medicalHistory}
        proposed={approval.proposed.medicalHistory}
        value={medicalHistory}
        onChange={setMedicalHistory}
      />
      <Box>
        <Button variant="contained" onClick={handleApprove} disabled={pending}>
          Setujui ke data pasien
        </Button>
      </Box>
    </Paper>
  );
}
