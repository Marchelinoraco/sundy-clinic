import Link from "next/link";
import type { EncounterIntake } from "@/server/encounter-read";
import { IntakeClinicalContent } from "./intake-clinical-content";

/** Isian kuis booking ini di bagian S (spec bagian 5). */
export function EncounterIntakeContent({ intake }: { intake: EncounterIntake | null }) {
  if (!intake) return <p className="text-sm text-muted-foreground">Tidak ada isian kuis untuk kunjungan ini.</p>;
  if (intake.state === "pending") return <p className="text-sm text-muted-foreground">Isian belum diisi pasien.</p>;

  const pageLink = (
    <Link href={`/admin/isian/${intake.id}`} className="underline underline-offset-4">
      Buka halaman isian
    </Link>
  );
  if (intake.state === "error") {
    return (
      <p className="text-sm text-destructive">
        {intake.message} {pageLink}
      </p>
    );
  }
  return (
    <details open className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">Isian pendaftaran</summary>
      <div className="mt-3 space-y-4">
        <IntakeClinicalContent clinical={intake.clinical} level={3} />
        <p className="text-sm">
          {intake.needsApproval ? (
            <Link href={`/admin/isian/${intake.id}`} className="underline underline-offset-4">
              Setujui ke data pasien
            </Link>
          ) : (
            pageLink
          )}
        </p>
      </div>
    </details>
  );
}
