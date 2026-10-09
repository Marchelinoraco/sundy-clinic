"use client";

import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import type { ReactNode } from "react";

/** Kotak angka dasbor (spec D 3.1): seluruh kotak bertautan; `attention` bergaris dan berlatar emas tipis. */
export function StatTile({ label, value, note, href, attention = false }: { label: string; value: ReactNode; note?: string | null; href: string; attention?: boolean }) {
  return (
    <Card
      sx={
        attention
          ? { borderColor: "primary.main", bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.08)" }
          : undefined
      }
    >
      <CardActionArea component={NextLink} href={href} data-attention={attention ? "true" : undefined} sx={{ p: 2, height: "100%", display: "block" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography component="div" sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "2.25rem", fontWeight: 600, lineHeight: 1.15 }}>
          {value}
        </Typography>
        {note && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {note}
          </Typography>
        )}
      </CardActionArea>
    </Card>
  );
}
