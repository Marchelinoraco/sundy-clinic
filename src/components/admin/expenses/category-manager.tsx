"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORY_NAME_MAX } from "@/lib/expense";
import { createExpenseCategory, setExpenseCategoryActive } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";
import { StatusChip } from "../mui/status-chip";

/** Tambah dan nonaktifkan kategori pengeluaran (spec laporan 7). Kategori tidak dihapus. */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Nama kategori baru"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ width: "100%", maxWidth: 320 }}
          slotProps={{ htmlInput: { maxLength: CATEGORY_NAME_MAX } }}
        />
        <Button type="button" variant="outlined" disabled={pending} onClick={() => run(() => createExpenseCategory({ name }), () => setName(""))}>
          Tambah kategori
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper
        component="ul"
        variant="outlined"
        sx={{ listStyle: "none", m: 0, p: 0, fontSize: "0.875rem", "& > li + li": { borderTop: 1, borderColor: "divider" } }}
      >
        {categories.map((category) => (
          <Box component="li" key={category.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 1.5, py: 1 }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", color: category.isActive ? undefined : "text.secondary" }}>
              <span>{category.name}</span>
              {!category.isActive && <StatusChip label="Nonaktif" />}
            </Stack>
            <Button
              type="button"
              size="small"
              variant="text"
              disabled={pending}
              aria-label={`${category.isActive ? "Nonaktifkan" : "Aktifkan"} ${category.name}`}
              onClick={() => run(() => setExpenseCategoryActive({ id: category.id, active: !category.isActive }))}
            >
              {category.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </Box>
        ))}
      </Paper>
    </Stack>
  );
}
