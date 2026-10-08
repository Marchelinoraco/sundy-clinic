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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateServicePrice } from "@/server/service-admin";
import { EmptyState, SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

type PriceService = { id: string; name: string; normalPrice: number | null; promoPrice: number };
export type PriceCategory = { id: string; name: string; services: PriceService[] };

const ALL = "semua";

function PriceRow({ service, hidden }: { service: PriceService; hidden: boolean }) {
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
      <TableCell sx={{ fontWeight: 500 }}>{service.name}</TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga coret ${service.name}`} placeholder="kosong" sx={{ width: 160 }} value={normalPrice} onChange={setNormalPrice} />
      </TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga berlaku ${service.name}`} sx={{ width: 160 }} value={promoPrice} onChange={setPromoPrice} />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {dirty && (
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <Button size="small" variant="contained" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button size="small" variant="text" onClick={cancel} disabled={pending}>
              Batal
            </Button>
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
export function ServicePriceTable({ categories }: { categories: PriceCategory[] }) {
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
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {category.services.map((service) => (
                    <PriceRow key={service.id} service={service} hidden={!matches(service)} />
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
