import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PrescriptionFields } from "@/components/admin/prescription-fields";
import type { PrescriptionInput } from "@/lib/prescription";
import { renderAdmin } from "../helpers/render-admin";

const MEDICINES = [
  { id: "o1", code: "AMX", name: "Amoxicillin", unit: "kapsul", available: 4 },
  { id: "o2", code: "VIT", name: "Vitamin C", unit: "tablet", available: 30 },
];

function Harness({ initial = [] as PrescriptionInput[] }) {
  const [rows, setRows] = useState(initial);
  return <PrescriptionFields rows={rows} medicines={MEDICINES} onChange={setRows} />;
}

describe("PrescriptionFields (spec resep dokter 3)", { timeout: 15_000 }, () => {
  it("menambah obat, menampilkan sisa stok tanpa harga, dan memperingatkan bila melebihi stok", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    expect(screen.getByText("Belum ada obat di resep ini.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tambah obat" }));
    const first = screen.getByRole("group", { name: "Obat 1" });
    // Baris baru tidak memilih obat apa pun: dokter harus memilihnya sendiri.
    expect(within(first).getByLabelText("Obat")).toHaveValue("");
    await user.selectOptions(within(first).getByLabelText("Obat"), "o1");
    expect(first).toHaveTextContent("Sisa 4 kapsul");
    expect(first).not.toHaveTextContent("Rp");
    await user.clear(within(first).getByLabelText("Jumlah"));
    await user.type(within(first).getByLabelText("Jumlah"), "10");
    expect(within(first).getByRole("alert")).toHaveTextContent("Sisa stok 4 kapsul — tagihan tertahan sampai stok cukup atau jumlah dikurangi.");
    await user.type(within(first).getByLabelText("Aturan pakai"), "3 x 1");
    await user.click(screen.getByRole("button", { name: "Hapus obat 1" }));
    expect(screen.getByText("Belum ada obat di resep ini.")).toBeInTheDocument();
  });

  it("keterangan 'Belum tersimpan' hanya pada baris yang belum lengkap", () => {
    renderAdmin(
      <Harness
        initial={[
          { itemId: "o2", quantity: "1", usage: "1 x 1" },
          { itemId: "o2", quantity: "1", usage: "" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Obat 1" })).not.toHaveTextContent("Belum tersimpan");
    expect(screen.getByRole("group", { name: "Obat 2" })).toHaveTextContent("Belum tersimpan — lengkapi obat, jumlah, dan aturan pakai.");
  });

  it("peringatan menjumlahkan dua baris obat yang sama", async () => {
    renderAdmin(
      <Harness
        initial={[
          { itemId: "o1", quantity: "3", usage: "pagi" },
          { itemId: "o1", quantity: "2", usage: "malam" },
        ]}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
