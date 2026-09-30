import type { IntakeClinical } from "@/server/intake-clinical";

/**
 * Jawaban kuis untuk staf: bagian jawaban, tabel kebiasaan (form recall), dan
 * tabel aktivitas kemarin. Dipakai halaman isian dan bagian S halaman kunjungan.
 */
export function IntakeClinicalContent({ clinical, level = 2 }: { clinical: IntakeClinical; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <>
      {clinical.sections.map((section) => (
        <section key={section.title} className="space-y-1">
          <Heading className="text-base font-medium">{section.title}</Heading>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}

      {clinical.habits && (
        <section className="space-y-2">
          <Heading className="text-base font-medium">Kebiasaan sehari (form recall)</Heading>
          <table aria-label="Kebiasaan sehari" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-16 py-1">Jam</th>
                <th className="py-1">Jenis dan jumlah</th>
              </tr>
            </thead>
            <tbody>
              {clinical.habits.rows.map((row) => (
                <tr key={row.label} className="border-b align-top">
                  <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
                  <td className="py-1">{row.entries.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clinical.habits.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {clinical.habits.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {clinical.activities && (
        <section className="space-y-2">
          <Heading className="text-base font-medium">Aktivitas {clinical.activityDateLabel ?? "kemarin"}</Heading>
          <table aria-label={`Aktivitas ${clinical.activityDateLabel ?? "kemarin"}`} className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-16 py-1">Jam</th>
                <th className="py-1">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {clinical.activities.map((row) => (
                <tr key={row.hour} className="border-b align-top">
                  <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
                  <td className="py-1">
                    {row.entries.map((entry, index) => (
                      <span key={index} className="mr-2 inline-block">
                        <span className="text-muted-foreground">{entry.kindLabel}:</span> {entry.text}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
