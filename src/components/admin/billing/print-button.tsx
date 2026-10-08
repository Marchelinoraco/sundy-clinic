"use client";

import Button from "@mui/material/Button";

export function PrintButton() {
  return (
    <Button type="button" variant="outlined" onClick={() => window.print()} className="print:hidden">
      Cetak
    </Button>
  );
}
