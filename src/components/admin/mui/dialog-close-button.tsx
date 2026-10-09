"use client";

import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";

/**
 * Tombol silang di pojok kanan atas dialog. Dialog shadcn lama selalu punya tombol ini (bernama "Close");
 * dipertahankan supaya dialog tetap bisa ditutup dengan satu ketukan di ponsel. Taruh di dalam <Dialog>.
 */
export function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton aria-label="Close" onClick={onClick} size="small" sx={{ position: "absolute", top: 8, right: 8 }}>
      <CloseIcon fontSize="small" />
    </IconButton>
  );
}
