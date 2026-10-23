"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useState } from "react";
import { FOOD_RECALL_AUTHOR_LABEL, foodRecallRows, type FoodRecallAuthor, type FoodRecallEntry } from "@/lib/food-recall";

/** Warna lencana penulis: dokter biru, perawat hijau, pasien abu (spec peran perawat 8). */
const AUTHOR_COLOR: Record<FoodRecallAuthor, "info" | "success" | "text"> = { DOKTER: "info", PERAWAT: "success", CUSTOMER: "text" };

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
                      {entry.text ? `${entry.kindLabel}:` : entry.kindLabel}
                    </Box>
                    {entry.text && ` ${entry.text}`}
                    <Box
                      component="span"
                      sx={
                        AUTHOR_COLOR[entry.by] === "text"
                          ? { ml: 0.5, borderRadius: 1, px: 0.5, fontSize: "0.75rem", color: "text.secondary", bgcolor: "action.hover" }
                          : {
                              ml: 0.5,
                              borderRadius: 1,
                              px: 0.5,
                              fontSize: "0.75rem",
                              color: `${AUTHOR_COLOR[entry.by]}.main`,
                              bgcolor: `rgba(var(--mui-palette-${AUTHOR_COLOR[entry.by]}-mainChannel) / 0.12)`,
                            }
                      }
                    >
                      {FOOD_RECALL_AUTHOR_LABEL[entry.by]}
                    </Box>
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
