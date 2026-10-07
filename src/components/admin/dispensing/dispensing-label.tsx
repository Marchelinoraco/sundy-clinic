import { formatDateWithYear } from "@/lib/format";
import type { DispensingDetail } from "@/server/dispensing-read";

/** Etiket obat untuk customer (spec penyerahan 6): tanpa harga dan tanpa data klinis. */
export function DispensingLabel({ detail, clinicName }: { detail: DispensingDetail; clinicName: string }) {
  return (
    <article aria-label="Etiket obat" className="mx-auto max-w-md space-y-3 rounded-md border p-4 text-sm print:border-0">
      <header className="space-y-0.5 border-b pb-2">
        <p className="text-base font-semibold">{clinicName}</p>
        <p className="font-medium">{detail.patientName}</p>
        <p className="text-muted-foreground">{formatDateWithYear(detail.startAt)}</p>
      </header>
      <ul className="space-y-2">
        {detail.lines.map((line) => (
          <li key={line.id}>
            <p className="font-medium">{line.itemName}</p>
            <p>Jumlah: {line.quantity}</p>
            <p>{line.usage}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
