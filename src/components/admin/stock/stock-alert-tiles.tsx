import { StatTile } from "../stat-tile";

/** Kotak Stok di dasbor (spec stok 8): barang yang perlu perhatian di cabang aktif. */
export function StockAlertTiles({ alerts }: { alerts: { low: number; expiringSoon: number; expired: number } }) {
  return (
    <section aria-label="Stok" className="grid gap-4 sm:grid-cols-3">
      <StatTile label="Stok menipis" value={alerts.low} note="barang" href="/admin/stok?tanda=MENIPIS" attention={alerts.low > 0} />
      <StatTile
        label="Segera kedaluwarsa"
        value={alerts.expiringSoon}
        note="barang, dalam 60 hari"
        href="/admin/stok?tanda=SEGERA_KEDALUWARSA"
        attention={alerts.expiringSoon > 0}
      />
      <StatTile
        label="Kedaluwarsa"
        value={alerts.expired}
        note="barang masih bersisa"
        href="/admin/stok?tanda=KEDALUWARSA"
        attention={alerts.expired > 0}
      />
    </section>
  );
}
