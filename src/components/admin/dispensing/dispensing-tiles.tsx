import { StatTile } from "../stat-tile";

/** Kotak Resep menunggu di dasbor Apoteker (spec penyerahan 6). */
export function DispensingTiles({ pending }: { pending: number }) {
  return (
    <section aria-label="Resep" className="grid gap-4 sm:grid-cols-2">
      <StatTile label="Resep menunggu" value={pending} note="kunjungan" href="/admin/resep" attention={pending > 0} />
    </section>
  );
}
