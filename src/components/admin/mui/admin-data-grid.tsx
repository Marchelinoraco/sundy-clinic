"use client";

import Box from "@mui/material/Box";
import { DataGrid, GridRow, type GridColDef, type GridRowProps, type GridSortModel, type GridValidRowModel } from "@mui/x-data-grid";
import { idID } from "@mui/x-data-grid/locales";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { EmptyState } from "../page-layout";

export const ADMIN_GRID_PAGE_SIZE = 25;
const LOCALE_TEXT = idID.components.MuiDataGrid.defaultProps.localeText;

const HighlightContext = createContext<string | undefined>(undefined);

/** Lama halaman dibiarkan "mengendap" sebelum pemusatan ulang berhenti. */
const SETTLE_MS = 3000;
/** Tanda pengguna mengambil alih: pemusatan ulang berhenti agar layar tidak ditarik kembali. */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;

/**
 * Baris DataGrid dengan `data-highlighted` untuk baris yang baru dibuat/dibuka (mis. booking dari tautan).
 * Baris yang disorot menggulir dirinya ke tengah layar setelah terpasang (DataGrid merender baris belakangan,
 * jadi efek di tingkat tabel belum menemukan barisnya). Setelah itu DataGrid mengukur tinggi baris dan tabel
 * lain di halaman ikut tumbuh, sehingga baris terdorong: selama halaman masih berubah tinggi, baris dipusatkan
 * ulang — sampai pengguna menggulir sendiri atau SETTLE_MS berlalu.
 */
function AdminGridRow(props: GridRowProps) {
  const highlightId = useContext(HighlightContext);
  const highlighted = highlightId !== undefined && props.rowId === highlightId;
  useEffect(() => {
    if (!highlighted) return;
    const center = () => document.querySelector('[role="row"][data-highlighted="true"]')?.scrollIntoView?.({ block: "center" });
    center();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => center());
    observer.observe(document.body);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, stop));
    };
    const timer = window.setTimeout(stop, SETTLE_MS);
    USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    return stop;
  }, [highlighted]);
  return <GridRow {...props} data-highlighted={highlighted ? "true" : undefined} />;
}

/**
 * Daftar besar panel admin (spec MUI 4): urut dan saring kolom, 25 baris per halaman, di sisi klien atas
 * baris yang sudah disaring server. Virtualisasi mati supaya semua baris halaman ada di DOM (pembaca layar,
 * cetak, uji). Daftar kosong memakai teks kosong lama, bukan lapisan bawaan DataGrid.
 * `highlightId` (tanpa `initialSort`): baris itu bertanda, halamannya dibuka, dan digulir ke tengah layar.
 */
export function AdminDataGrid<R extends GridValidRowModel>({
  rows,
  columns,
  label,
  emptyText,
  initialSort,
  getRowId,
  highlightId,
}: {
  rows: readonly R[];
  columns: GridColDef<R>[];
  /** Nama aksesibel tabel. */
  label: string;
  emptyText: ReactNode;
  initialSort?: GridSortModel;
  getRowId?: (row: R) => string;
  highlightId?: string;
}) {
  const highlightIndex = highlightId === undefined ? -1 : rows.findIndex((row) => String(getRowId ? getRowId(row) : row.id) === highlightId);

  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <HighlightContext.Provider value={highlightIndex >= 0 ? highlightId : undefined}>
      <Box sx={{ width: "100%", minWidth: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          label={label}
          localeText={LOCALE_TEXT}
          autoHeight
          disableVirtualization
          disableRowSelectionOnClick
          getRowHeight={() => "auto"}
          initialState={{
            pagination: { paginationModel: { page: highlightIndex >= 0 ? Math.floor(highlightIndex / ADMIN_GRID_PAGE_SIZE) : 0, pageSize: ADMIN_GRID_PAGE_SIZE } },
            sorting: { sortModel: initialSort ?? [] },
          }}
          pageSizeOptions={[ADMIN_GRID_PAGE_SIZE]}
          hideFooter={rows.length <= ADMIN_GRID_PAGE_SIZE}
          slots={{ row: AdminGridRow }}
          sx={{
            border: 0,
            // Isi sel boleh turun baris (tinggi baris otomatis), dan anak sel tidak melebihi lebar kolomnya:
            // tanpa ini tombol aksi dan teks panjang terpotong.
            "& .MuiDataGrid-cell": { py: 1, display: "flex", alignItems: "center", whiteSpace: "normal", lineHeight: 1.43 },
            "& .MuiDataGrid-cell > *": { minWidth: 0, maxWidth: "100%" },
            "& .MuiDataGrid-row[data-highlighted='true']": { bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.16)" },
          }}
        />
      </Box>
    </HighlightContext.Provider>
  );
}
