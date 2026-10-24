"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CONSULTATION_SERVICE_SLUG } from "@/lib/booking-rules";
import type { OtherCost, ServiceCostInput } from "@/lib/costing";
import { RETURN_INTERVALS, returnIntervalLabel } from "@/lib/treatment-reminder";
import { setServiceActive, setServiceReturnReminder, updateServicePrice } from "@/server/service-admin";
import { SelectField } from "./mui/select-field";
import { EmptyState, SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";
import { ServiceCostDialog } from "./service-cost-dialog";
import { ActiveToggleButton } from "./service/active-toggle-button";
import { InternalServiceDialog } from "./service/internal-service-dialog";

type PriceService = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  normalPrice: number | null;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
  isActive: boolean;
  /** Jarak pengingat treatment dalam hari; null = tidak diingatkan (spec pengingat treatment PT2). */
  returnReminderDays: number | null;
  /** Jumlah layanan situs aktif yang menautkan; 0 = "Hanya internal". */
  siteCount: number;
  otherCosts: OtherCost[];
} & ServiceCostInput;
export type PriceCategory = { id: string; name: string; services: PriceService[] };

const ALL = "semua";

/** Pilihan "Ingatkan kembali" yang langsung tersimpan saat diganti (spec pengingat treatment PT2). */
function ReturnReminderSelect({ service }: { service: PriceService }) {
  const [days, setDays] = useState<number | null>(service.returnReminderDays);
  const [pending, startTransition] = useTransition();

  function change(value: string) {
    const next = value === "" ? null : Number(value);
    const previous = days;
    setDays(next);
    startTransition(async () => {
      try {
        const result = await setServiceReturnReminder({ serviceId: service.id, days: next });
        if (!result.ok) {
          setDays(previous);
          toast.error(result.error);
          return;
        }
        toast.success(`${service.name}: ${returnIntervalLabel(next)}.`);
      } catch {
        setDays(previous);
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SelectField aria-label={`Ingatkan kembali ${service.name}`} value={days === null ? "" : String(days)} onChange={change} disabled={pending} fullWidth={false} sx={{ minWidth: 150 }}>
      <option value="">{returnIntervalLabel(null)}</option>
      {RETURN_INTERVALS.map((value) => (
        <option key={value} value={String(value)}>
          {returnIntervalLabel(value)}
        </option>
      ))}
    </SelectField>
  );
}

function PriceRow({ service, hidden, categoryOptions }: { service: PriceService; hidden: boolean; categoryOptions: { id: string; name: string }[] }) {
  const [saved, setSaved] = useState({ normalPrice: service.normalPrice, promoPrice: service.promoPrice as number | null });
  const [normalPrice, setNormalPrice] = useState<number | null>(service.normalPrice);
  const [promoPrice, setPromoPrice] = useState<number | null>(service.promoPrice);
  const [pending, startTransition] = useTransition();
  const dirty = normalPrice !== saved.normalPrice || promoPrice !== saved.promoPrice;

  function save() {
    if (promoPrice === null) {
      toast.error("Isi harga berlaku.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateServicePrice({ id: service.id, normalPrice, promoPrice });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSaved({ normalPrice, promoPrice });
        toast.success(`Harga ${service.name} tersimpan.`);
      } catch {
        toast.error("Harga gagal disimpan. Coba lagi.");
      }
    });
  }

  function cancel() {
    setNormalPrice(saved.normalPrice);
    setPromoPrice(saved.promoPrice);
  }

  return (
    <TableRow hidden={hidden}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {service.name}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {service.durationMin} menit{service.requiresDoctor ? " · perlu dokter" : ""}
          {service.isActive ? "" : " · Nonaktif"}
        </Typography>
      </TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga coret ${service.name}`} placeholder="kosong" sx={{ width: 160 }} value={normalPrice} onChange={setNormalPrice} />
      </TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga berlaku ${service.name}`} sx={{ width: 160 }} value={promoPrice} onChange={setPromoPrice} />
      </TableCell>
      <TableCell>
        {/* Harga yang baru disimpan di baris ini ikut ke dialog, supaya Simpan di dialog tidak menimpanya dengan harga lama. */}
        <ServiceCostDialog service={{ ...service, normalPrice: saved.normalPrice, promoPrice: saved.promoPrice ?? service.promoPrice }} />
      </TableCell>
      <TableCell>
        <ReturnReminderSelect service={service} />
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{service.siteCount > 0 ? `${service.siteCount} layanan situs` : "Hanya internal"}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {dirty ? (
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <Button size="small" variant="contained" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button size="small" variant="text" onClick={cancel} disabled={pending}>
              Batal
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <InternalServiceDialog categories={categoryOptions} service={service} />
            {service.slug !== CONSULTATION_SERVICE_SLUG && (
              <ActiveToggleButton
                name={service.name}
                active={service.isActive}
                confirmText={
                  service.siteCount > 0
                    ? `Layanan ini juga hilang dari situs (${service.siteCount} layanan situs) dan tidak bisa dipilih di booking maupun tagihan.`
                    : "Layanan ini tidak bisa dipilih lagi di booking maupun tagihan."
                }
                onToggle={(active) => setServiceActive({ id: service.id, active })}
              />
            )}
          </Stack>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Harga per kategori (spec D 5.4). Cari dan chip kategori menyaring di browser;
 * baris yang tersaring hanya disembunyikan, agar perubahan yang belum disimpan tidak hilang.
 */
export function ServicePriceTable({ categories, categoryOptions }: { categories: PriceCategory[]; categoryOptions: { id: string; name: string }[] }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = (service: PriceService) => !needle || service.name.toLowerCase().includes(needle);
  const visibleCategory = (category: PriceCategory) =>
    (categoryId === null || category.id === categoryId) && category.services.some(matches);
  const anyVisible = categories.some(visibleCategory);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          type="search"
          placeholder="Cari layanan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Cari layanan" } }}
          sx={{ width: { xs: "100%", sm: 256 } }}
        />
        <ToggleButtonGroup
          aria-label="Kategori"
          size="small"
          exclusive
          value={categoryId ?? ALL}
          onChange={(_, next: string | null) => next !== null && setCategoryId(next === ALL ? null : next)}
          sx={{ flexWrap: "wrap" }}
        >
          <ToggleButton value={ALL}>Semua</ToggleButton>
          {categories.map((category) => (
            <ToggleButton key={category.id} value={category.id}>
              {category.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {!anyVisible && <EmptyState>Tidak ada layanan yang cocok.</EmptyState>}

      {categories.map((category) => (
        <div key={category.id} hidden={!visibleCategory(category)}>
          <SectionCard title={category.name} description={`${category.services.length} layanan`} flush>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Layanan</TableCell>
                    <TableCell>Harga coret</TableCell>
                    <TableCell>Harga berlaku</TableCell>
                    <TableCell>Biaya per sesi</TableCell>
                    <TableCell>Ingatkan kembali</TableCell>
                    <TableCell>Di situs</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {category.services.map((service) => (
                    <PriceRow
                      // Harga tersimpan ikut kunci: setelah "Ubah" menyimpan harga baru, baris dipasang ulang dari nilai baru,
                      // sehingga Simpan inline tidak mengirim harga lama (review akhir layanan situs).
                      key={`${service.id}-${service.promoPrice}-${service.normalPrice ?? ""}`}
                      service={service}
                      hidden={!matches(service)}
                      categoryOptions={categoryOptions}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </div>
      ))}
    </Stack>
  );
}
