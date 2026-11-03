"use client";

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { categoryPhotoName } from "@/lib/service-category";
import type { ServiceCategoryRow } from "@/server/catalog-admin-read";
import { deleteServiceCategory, moveServiceCategory } from "@/server/service-category-admin";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { StatusChip } from "../mui/status-chip";
import { CategoryDialog } from "./category-dialog";

/** Daftar semua kategori layanan: tambah, ubah, urutkan, dan hapus (spec kategori layanan KL2, KL4, KL6, KL8). */
export function CategoryManagerDialog({ categories }: { categories: ServiceCategoryRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, done?: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (done) toast.success(done);
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        onClick={() => {
          setConfirming(null);
          setError(null);
          setOpen(true);
        }}
      >
        Kelola kategori
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Kelola kategori</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Urutan di sini dipakai di situs dan di semua daftar layanan.
              </Typography>
              <CategoryDialog />
            </Stack>
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {categories.map((category, index) => (
                <Box
                  component="li"
                  key={category.id}
                  aria-label={category.name}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 1.25, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}
                >
                  {categoryPhotoName(category.imageUrl) && (
                    <Box
                      component="img"
                      src={category.imageUrl ?? undefined}
                      alt=""
                      sx={{ width: 56, height: 42, objectFit: "cover", borderRadius: 1, flexShrink: 0, bgcolor: "action.hover" }}
                    />
                  )}
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {category.name}
                      </Typography>
                      {!category.selfBookable && <StatusChip label="Tidak dipesan sendiri" />}
                    </Stack>
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                      {category.serviceCount} layanan internal · {category.siteServiceCount} layanan situs
                      {category.locked ? " · Berisi Konsultasi Online" : ""}
                    </Typography>
                  </Box>
                  {confirming === category.id ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography variant="body2">Hapus kategori {category.name}?</Typography>
                      <Button
                        type="button"
                        size="small"
                        color="error"
                        variant="contained"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(() => deleteServiceCategory(category.id), "Kategori dihapus.");
                        }}
                      >
                        Ya, hapus
                      </Button>
                      <Button type="button" size="small" disabled={pending} onClick={() => setConfirming(null)}>
                        Batal
                      </Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <IconButton
                        size="small"
                        aria-label={`Naikkan ${category.name}`}
                        disabled={pending || index === 0}
                        onClick={() => run(() => moveServiceCategory({ id: category.id, direction: "up" }))}
                      >
                        <KeyboardArrowUpIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Turunkan ${category.name}`}
                        disabled={pending || index === categories.length - 1}
                        onClick={() => run(() => moveServiceCategory({ id: category.id, direction: "down" }))}
                      >
                        <KeyboardArrowDownIcon fontSize="small" />
                      </IconButton>
                      <CategoryDialog row={category} />
                      {!category.locked && (
                        <Button
                          type="button"
                          size="small"
                          color="error"
                          disabled={pending}
                          aria-label={`Hapus ${category.name}`}
                          onClick={() => {
                            setError(null);
                            setConfirming(category.id);
                          }}
                        >
                          Hapus
                        </Button>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
