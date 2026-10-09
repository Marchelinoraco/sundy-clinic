"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useState } from "react";
import { foodRecallRows, type FoodRecallEntry } from "@/lib/food-recall";

/** Tabel 06.00–22.00 (spec check-in 5.1); jam kosong disembunyikan sampai diminta. */
export function FoodRecallTable({ entries, label }: { entries: readonly FoodRecallEntry[]; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = foodRecallRows(entries).filter((row) => showAll || row.entries.length > 0);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 64 }}>Jam</TableCell>
            <TableCell>Catatan</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.hour}>
              <TableCell sx={{ verticalAlign: "top", fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>{row.label}</TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                {row.entries.map((entry, index) => (
                  <Box component="span" key={index} sx={{ mr: 1, display: "inline-block" }}>
                    <Box component="span" sx={{ color: "text.secondary" }}>
                      {entry.kindLabel}:
                    </Box>{" "}
                    {entry.text}
                    {entry.byDoctor && (
                      <Box component="span" sx={{ ml: 0.5, borderRadius: 1, px: 0.5, fontSize: "0.75rem", color: "info.main", bgcolor: "rgba(var(--mui-palette-info-mainChannel) / 0.12)" }}>
                        dilengkapi dokter
                      </Box>
                    )}
                  </Box>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        type="button"
        variant="text"
        size="small"
        sx={{ alignSelf: "flex-start", px: 0, minWidth: 0, fontSize: "0.75rem", color: "text.secondary", textDecoration: "underline" }}
        onClick={() => setShowAll((value) => !value)}
      >
        {showAll ? "Sembunyikan jam kosong" : "Tampilkan 06.00–22.00"}
      </Button>
    </Box>
  );
}
