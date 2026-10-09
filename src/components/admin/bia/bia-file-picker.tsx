"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { BIA_ACCEPT } from "@/lib/bia";
import { sendBiaFile, type SendResult } from "./send-files";

/**
 * Pilih satu atau beberapa foto/PDF hasil BIA (spec hasil BIA 6.1). Di ponsel dan tablet kotak pilih berkas
 * langsung menawarkan kamera atau galeri. Berkas dikirim berurutan; hasil tiap berkas ditulis di bawahnya.
 */
export function BiaFilePicker({ appointmentId, onUploaded }: { appointmentId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

  async function send(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    const done: SendResult[] = [];
    for (const file of files) {
      done.push(await sendBiaFile(appointmentId, file));
      setResults([...done]);
    }
    setBusy(false);
    if (done.some((result) => result.ok)) onUploaded();
  }

  return (
    <Stack spacing={1}>
      <Box>
        <Button component="label" variant="outlined" disabled={busy}>
          {busy ? "Mengunggah…" : "Pilih foto atau PDF"}
          <input
            hidden
            type="file"
            multiple
            accept={BIA_ACCEPT}
            aria-label="Berkas hasil BIA"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void send(files);
            }}
          />
        </Button>
      </Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        JPG, PNG, WebP, HEIC, atau PDF; paling besar 10 MB per berkas, paling banyak 5 berkas.
      </Typography>
      {results.length > 0 && (
        <Box component="ul" aria-label="Hasil unggahan" sx={{ m: 0, pl: 2.5, fontSize: "0.875rem" }}>
          {results.map((result, index) => (
            <Box component="li" key={`${result.name}-${index}`} sx={{ color: result.ok ? "success.main" : "error.main" }}>
              {result.ok ? `${result.name}: terunggah` : `${result.name}: ${result.error}`}
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
