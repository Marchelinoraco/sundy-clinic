import type { EncounterWarnings } from "@/server/encounter-read";

function Warning({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

/** Kotak peringatan di atas setiap kunjungan (spec R6, bagian 5). Bagian kosong tidak ditampilkan. */
export function EncounterWarningsBox({ warnings }: { warnings: EncounterWarnings }) {
  const recordMissing = !warnings.allergies && !warnings.medicalHistory;
  return (
    <section
      aria-labelledby="peringatan"
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <h2 id="peringatan" className="text-base font-medium">
        Peringatan
      </h2>
      {recordMissing ? (
        <p>Alergi dan riwayat penyakit belum dicatat.</p>
      ) : (
        <>
          {warnings.allergies && <Warning label="Alergi" text={warnings.allergies} />}
          {warnings.medicalHistory && <Warning label="Riwayat penyakit & obat" text={warnings.medicalHistory} />}
        </>
      )}
      {warnings.importantNotes && <Warning label="Catatan penting" text={warnings.importantNotes} />}
      {warnings.pregnancy && <p className="font-medium">Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)</p>}
      {warnings.paperRecordNumber && <p>Ada berkas kertas: {warnings.paperRecordNumber}</p>}
    </section>
  );
}
