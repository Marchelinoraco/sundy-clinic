import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PrescriptionFields } from "@/components/admin/prescription-fields";
import type { PrescriptionInput } from "@/lib/prescription";
import { parseUsage } from "@/lib/usage";
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
    await user.selectOptions(within(first).getByLabelText("Aturan pakai"), "3xSehari");
    await user.click(screen.getByRole("button", { name: "Hapus obat 1" }));
    expect(screen.getByText("Belum ada obat di resep ini.")).toBeInTheDocument();
  });

  it("keterangan 'Belum tersimpan' hanya pada baris yang belum lengkap", () => {
    renderAdmin(
      <Harness
        initial={[
          { itemId: "o2", quantity: "1", usage: parseUsage("1 x 1") },
          { itemId: "o2", quantity: "1", usage: { frequency: "", custom: "", timing: "SEBELUM MAKAN" } },
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
          { itemId: "o1", quantity: "3", usage: parseUsage("pagi") },
          { itemId: "o1", quantity: "2", usage: parseUsage("malam") },
        ]}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("aturan pakai: lima pilihan + Lainnya, waktu SEBELUM MAKAN bisa diubah (spec aturan pakai AP1, AP2)", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    await user.click(screen.getByRole("button", { name: "Tambah obat" }));
    const first = screen.getByRole("group", { name: "Obat 1" });
    const frequency = within(first).getByLabelText("Aturan pakai");
    expect(frequency).toHaveValue("");
    expect([...within(frequency).getAllByRole("option")].map((option) => option.textContent)).toEqual([
      "Pilih aturan pakai",
      "1xSehari",
      "1xSeminggu",
      "1-2xSehari",
      "2-3xSehari",
      "3xSehari",
      "Lainnya (ketik sendiri)",
    ]);
    expect(within(first).getByLabelText("Waktu")).toHaveValue("SEBELUM MAKAN");
    expect(within(first).queryByLabelText("Aturan pakai lain")).toBeNull();
    expect(first).toHaveTextContent("Belum tersimpan");

    await user.selectOptions(frequency, "2-3xSehari");
    await user.selectOptions(within(first).getByLabelText("Obat"), "o2");
    expect(first).not.toHaveTextContent("Belum tersimpan");

    await user.selectOptions(frequency, "LAINNYA");
    expect(first).toHaveTextContent("Belum tersimpan");
    await user.type(within(first).getByLabelText("Aturan pakai lain"), "bila perlu");
    await user.clear(within(first).getByLabelText("Waktu"));
    await user.type(within(first).getByLabelText("Waktu"), "SESUDAH MAKAN");
    expect(first).not.toHaveTextContent("Belum tersimpan");
    expect(within(first).getByLabelText("Aturan pakai lain")).toHaveValue("bila perlu");
  });
});
