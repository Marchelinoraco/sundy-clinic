import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { RESTOCK_STATUS_LABEL, type RestockStatusValue } from "@/lib/counter-stock";
import { formatDateWithYear } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { RestockRequestRow } from "@/server/restock-read";
import { LinkButton } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";
import { EmptyState } from "../page-layout";
import { CancelRestockButton } from "./cancel-restock-button";

const TONE: Record<RestockStatusValue, StatusTone> = { MENUNGGU: "warning", SELESAI: "success", DITOLAK: "error", DIBATALKAN: "neutral" };

/** Daftar permintaan restock (spec stok meja 4): menunggu atau riwayat, tanpa sisa gudang. */
export function RestockRequestList({ rows, canCancel, linkToDetail }: { rows: RestockRequestRow[]; canCancel: boolean; linkToDetail: boolean }) {
  if (rows.length === 0) return <EmptyState>Belum ada permintaan.</EmptyState>;
  return (
    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
      {rows.map((row) => (
        <Box component="li" key={row.id} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 0.5, fontSize: "0.875rem" }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <StatusChip label={RESTOCK_STATUS_LABEL[row.status]} tone={TONE[row.status]} />
            <Box component="span" sx={{ fontWeight: 500 }}>
              {row.requestedByName}
            </Box>
            <Box component="span" sx={{ color: "text.secondary" }}>
              {formatDateWithYear(row.createdAt)} {minutesToTimeLabel(witaMinutesOfDay(row.createdAt))} · {row.branchName}
            </Box>
          </Stack>
          {row.lines.map((line) => (
            <Box key={line.id}>
              {`${line.itemName}: diminta ${line.requestedQuantity} ${line.unit}${line.sentQuantity !== null ? ` · dikirim ${line.sentQuantity} ${line.unit}` : ""}`}
            </Box>
          ))}
          {row.note && <Box sx={{ color: "text.secondary" }}>Catatan: {row.note}</Box>}
          {row.status === "SELESAI" && <Box sx={{ color: "text.secondary" }}>{`Dikirim ${row.decidedByName ?? ""}`}</Box>}
          {row.status === "DITOLAK" && <Box sx={{ color: "error.main" }}>{`Ditolak ${row.decidedByName ?? ""}: ${row.rejectReason ?? ""}`}</Box>}
          {row.status === "MENUNGGU" && (canCancel || linkToDetail) && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", pt: 0.5 }}>
              {linkToDetail && (
                <LinkButton href={`/admin/stok/permintaan/${row.id}`} size="small" variant="outlined">
                  Proses
                </LinkButton>
              )}
              {canCancel && <CancelRestockButton requestId={row.id} version={row.version} />}
            </Stack>
          )}
        </Box>
      ))}
    </Box>
  );
}
