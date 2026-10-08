"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { IntakeClinical } from "@/server/intake-clinical";

const HEADING = { fontSize: "1rem", fontWeight: 500, mb: 0.5 } as const;
const LIST = { m: 0, pl: 2.5, fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: 0.25 } as const;
const HOUR_CELL = { width: 64, fontVariantNumeric: "tabular-nums", color: "text.secondary", verticalAlign: "top" } as const;

/**
 * Jawaban kuis untuk staf: bagian jawaban, tabel kebiasaan (form recall), dan
 * tabel aktivitas kemarin. Dipakai halaman isian dan tab Isian halaman kunjungan.
 * Mode ringkas dipakai halaman kunjungan.
 */
export function IntakeClinicalContent({
  clinical,
  level = 2,
  compact = false,
}: {
  clinical: IntakeClinical;
  level?: 2 | 3;
  /** Halaman kunjungan: hanya jam yang berisi, dengan tombol untuk membuka tabel penuh. */
  compact?: boolean;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const [showAll, setShowAll] = useState(!compact);
  const habitRows = clinical.habits?.rows.filter((row) => showAll || row.entries.length > 0) ?? [];
  const activityRows = clinical.activities?.filter((row) => showAll || row.entries.length > 0) ?? [];
  const hasEmptyHours =
    (clinical.habits?.rows.some((row) => row.entries.length === 0) ?? false) ||
    (clinical.activities?.some((row) => row.entries.length === 0) ?? false);
  const toggle = compact && hasEmptyHours && (
    <Button
      type="button"
      variant="text"
      size="small"
      sx={{ alignSelf: "flex-start", px: 0, minWidth: 0, fontSize: "0.75rem", color: "text.secondary", textDecoration: "underline" }}
      onClick={() => setShowAll((value) => !value)}
    >
      {showAll ? "Sembunyikan jam kosong" : "Tampilkan 06.00–22.00"}
    </Button>
  );
  return (
    <>
      {clinical.sections.map((section) => (
        <Box component="section" key={section.title}>
          <Typography component={Heading} sx={HEADING}>
            {section.title}
          </Typography>
          <Box component="ul" sx={LIST}>
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
        </Box>
      ))}

      {clinical.habits && (
        <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography component={Heading} sx={HEADING}>
            Kebiasaan sehari (form recall)
          </Typography>
          <Table size="small" aria-label="Kebiasaan sehari">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 64 }}>Jam</TableCell>
                <TableCell>Jenis dan jumlah</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {habitRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell sx={HOUR_CELL}>{row.label}</TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>{row.entries.join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {toggle}
          {clinical.habits.notes.length > 0 && (
            <Box component="ul" sx={LIST}>
              {clinical.habits.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </Box>
          )}
        </Box>
      )}

      {clinical.activities && (
        <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography component={Heading} sx={HEADING}>
            Aktivitas {clinical.activityDateLabel ?? "kemarin"}
          </Typography>
          <Table size="small" aria-label={`Aktivitas ${clinical.activityDateLabel ?? "kemarin"}`}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 64 }}>Jam</TableCell>
                <TableCell>Catatan</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activityRows.map((row) => (
                <TableRow key={row.hour}>
                  <TableCell sx={HOUR_CELL}>{row.label}</TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>
                    {row.entries.map((entry, index) => (
                      <Box component="span" key={index} sx={{ mr: 1, display: "inline-block" }}>
                        <Box component="span" sx={{ color: "text.secondary" }}>
                          {entry.kindLabel}:
                        </Box>{" "}
                        {entry.text}
                      </Box>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {toggle}
        </Box>
      )}
    </>
  );
}
