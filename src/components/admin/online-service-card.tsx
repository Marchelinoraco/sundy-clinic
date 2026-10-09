"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { updateOnlineService, type OnlineServiceSettings } from "@/server/service-admin";
import { SelectField } from "./mui/select-field";
import { SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

const DURATIONS = [15, 30, 45, 60];

/** Konsultasi Online tidak ada di katalog layanan, jadi diatur di kartu sendiri (spec 3.3). */
export function OnlineServiceCard({ settings }: { settings: OnlineServiceSettings }) {
  const router = useRouter();
  const [price, setPrice] = useState<number | null>(settings.price || null);
  const [durationMin, setDurationMin] = useState(settings.durationMin);
  const [active, setActive] = useState(settings.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateOnlineService({ price: price ?? 0, durationMin, active });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Pengaturan Konsultasi Online tersimpan.");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Konsultasi Online"
      description="Konsultasi lewat WhatsApp tanpa slot jadwal. Customer membayar biaya booking ditambah harga ini di muka."
    >
      <Stack spacing={2}>
        <Typography variant="body2">
          Status: <strong>{settings.active ? `Aktif · ${formatRupiah(settings.price)}` : "Belum aktif"}</strong>
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
          <RupiahInput id="online-price" label="Harga" aria-label="Harga Konsultasi Online" value={price} onChange={setPrice} fullWidth />
          <SelectField id="online-duration" label="Durasi" value={String(durationMin)} onChange={(value) => setDurationMin(Number(value))}>
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} menit
              </option>
            ))}
          </SelectField>
        </Box>
        <FormControlLabel
          control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />}
          label="Aktifkan konsultasi online"
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            Simpan
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}
