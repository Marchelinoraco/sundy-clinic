"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { updateServicePrice } from "@/server/service-admin";
import { SectionCard } from "./page-layout";
import { RupiahInput } from "./rupiah-input";

type PriceService = { id: string; name: string; normalPrice: number | null; promoPrice: number };
export type PriceCategory = { id: string; name: string; services: PriceService[] };

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
      <TableCell className="font-medium">{service.name}</TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga coret ${service.name}`} placeholder="kosong" className="w-36" value={normalPrice} onChange={setNormalPrice} />
      </TableCell>
      <TableCell>
        <RupiahInput aria-label={`Harga berlaku ${service.name}`} className="w-36" value={promoPrice} onChange={setPromoPrice} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {dirty && (
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              Batal
            </Button>
          </div>
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

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-gold-400 bg-cream-200 font-semibold text-brown-900" : "bg-card text-muted-foreground hover:text-brown-900",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Cari layanan"
          placeholder="Cari layanan…"
          className="w-full sm:w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div role="group" aria-label="Kategori" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={categoryId === null} className={chip(categoryId === null)} onClick={() => setCategoryId(null)}>
            Semua
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              className={chip(categoryId === category.id)}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {!anyVisible && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada layanan yang cocok.</p>}

      {categories.map((category) => (
        <div key={category.id} hidden={!visibleCategory(category)}>
          <SectionCard title={category.name} description={`${category.services.length} layanan`} flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Harga coret</TableHead>
                  <TableHead>Harga berlaku</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {category.services.map((service) => (
                  <PriceRow key={service.id} service={service} hidden={!matches(service)} />
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </div>
      ))}
    </div>
  );
}
