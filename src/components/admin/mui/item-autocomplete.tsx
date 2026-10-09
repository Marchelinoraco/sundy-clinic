"use client";

import Autocomplete from "@mui/material/Autocomplete";
import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";

export type ItemOption = { id: string; code: string; name: string; unit?: string; available?: number };

/** Teks opsi sama persis dengan `<option>` lama, supaya kebiasaan staf dan uji tetap berlaku. */
export function itemOptionLabel(item: ItemOption, showStock: boolean): string {
  const base = `${item.name} (${item.code})`;
  return showStock ? `${base} — sisa ${item.available ?? 0} ${item.unit ?? ""}`.trimEnd() : base;
}

/**
 * Pilih barang dengan pencarian nama/kode (spec MUI 4): barang masuk, tambah barang tagihan, tambah obat
 * resep. Dengan `showStock`, barang tanpa sisa tetap tampil tetapi tidak bisa dipilih.
 */
export function ItemAutocomplete({
  label,
  "aria-label": ariaLabel,
  id,
  items,
  value,
  onChange,
  showStock = false,
  disabled,
  sx,
}: {
  label?: string;
  "aria-label"?: string;
  id?: string;
  items: ItemOption[];
  value: string;
  onChange: (itemId: string) => void;
  showStock?: boolean;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  return (
    <Autocomplete
      id={id}
      options={items}
      value={selected}
      onChange={(_, item) => onChange(item?.id ?? "")}
      getOptionLabel={(item) => itemOptionLabel(item, showStock)}
      getOptionDisabled={(item) => showStock && (item.available ?? 0) <= 0}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText="Tidak ada barang yang cocok."
      disabled={disabled}
      fullWidth
      sx={sx}
      renderInput={(params) => (
        <TextField {...params} label={label} slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": ariaLabel } }} />
      )}
    />
  );
}
