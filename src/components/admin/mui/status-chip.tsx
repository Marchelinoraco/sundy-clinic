"use client";

import Chip from "@mui/material/Chip";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error" | "primary";

const COLOR = { neutral: "default", info: "info", success: "success", warning: "warning", error: "error", primary: "primary" } as const;

/** Lencana status (booking, tagihan, hutang, resep, stok) dengan warna dari tema, terbaca di kedua skema. */
export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return <Chip label={label} color={COLOR[tone]} variant={tone === "neutral" ? "outlined" : "filled"} />;
}
