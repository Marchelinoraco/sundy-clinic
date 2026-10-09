import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ItemAutocomplete, type ItemOption } from "@/components/admin/mui/item-autocomplete";
import { pickOption } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const items: ItemOption[] = [
  { id: "vit", code: "VIT-01", name: "Vitamin C", unit: "tablet", available: 10 },
  { id: "kos", code: "SRM-02", name: "Serum Kosong", unit: "botol", available: 0 },
];

function Harness({ showStock, onChange }: { showStock?: boolean; onChange: (id: string) => void }) {
  const [value, setValue] = useState("");
  return <ItemAutocomplete label="Barang" items={items} value={value} showStock={showStock} onChange={(id) => (setValue(id), onChange(id))} />;
}

describe("ItemAutocomplete", () => {
  it("teks opsi sama dengan pilihan lama; memilih meneruskan id barang", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={onChange} />);
    await pickOption(user, "Barang", "Vitamin C (VIT-01)");
    expect(onChange).toHaveBeenLastCalledWith("vit");
    expect(screen.getByRole("combobox", { name: "Barang" })).toHaveValue("Vitamin C (VIT-01)");
  });

  it("dengan sisa stok: sisa tampil dan barang habis tidak bisa dipilih", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness showStock onChange={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "Barang" }));
    expect(await screen.findByRole("option", { name: "Vitamin C (VIT-01) — sisa 10 tablet" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "Serum Kosong (SRM-02) — sisa 0 botol" })).toHaveAttribute("aria-disabled", "true");
  });

  it("mencari lewat kode; tanpa hasil → 'Tidak ada barang yang cocok.'", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Barang" });
    await user.type(input, "srm");
    expect(await screen.findByRole("option", { name: "Serum Kosong (SRM-02)" })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "zzz");
    expect(await screen.findByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });

  it("menghapus pilihan meneruskan id kosong", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onChange={onChange} />);
    await pickOption(user, "Barang", "Vitamin C (VIT-01)");
    await user.clear(screen.getByRole("combobox", { name: "Barang" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
