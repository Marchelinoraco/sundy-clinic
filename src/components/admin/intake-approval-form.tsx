"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approveIntakeToPatient, type IntakeApproval } from "@/server/intake";

type ReadyApproval = Extract<IntakeApproval, { state: "ready" }>;

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function RecordField(props: {
  label: string;
  current: string | null;
  proposed: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-base font-medium">
        {props.label}
      </Label>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted p-2">
          <p className="text-xs text-muted-foreground">Data pasien saat ini</p>
          <p className="whitespace-pre-line">{props.current || "(kosong)"}</p>
        </div>
        <div className="rounded-md bg-muted p-2">
          <p className="text-xs text-muted-foreground">Usulan dari isian</p>
          <p className="whitespace-pre-line">{props.proposed || "(tidak ada di isian ini)"}</p>
        </div>
      </div>
      <textarea
        id={id}
        rows={4}
        maxLength={2000}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
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
    <section aria-labelledby="setujui-data-pasien" className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 id="setujui-data-pasien" className="text-base font-medium">
          Setujui ke data pasien
        </h2>
        <p className="text-sm text-muted-foreground">
          Isi kedua kolom di bawah menggantikan catatan alergi dan riwayat penyakit pasien. Jawaban pasien di
          isian ini tidak berubah.
        </p>
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
      <Button onClick={handleApprove} disabled={pending}>
        Setujui ke data pasien
      </Button>
    </section>
  );
}
