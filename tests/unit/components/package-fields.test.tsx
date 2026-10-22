import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PackageFields } from "@/components/admin/package-fields";
import { renderAdmin } from "../helpers/render-admin";

const OPTIONS = [
  { id: "pk1", name: "Glowing 3 Bulan", contents: "4× Facial Brightening, 28 kapsul Slimming Capsule" },
  { id: "pk2", name: "Slim Start", contents: "2× RF Perut" },
];

function Harness() {
  const [rows, setRows] = useState<{ packageId: string }[]>([]);
  return <PackageFields rows={rows} options={OPTIONS} onChange={setRows} />;
}

describe("PackageFields (spec vital perawat PR1)", () => {
  it("menambah paket dari katalog, menampilkan isinya tanpa harga, dan menghapusnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    await user.click(screen.getByRole("button", { name: "Tambah paket" }));
    const row = screen.getByRole("group", { name: "Paket 1" });
    expect(within(row).getByLabelText("Paket")).toHaveValue("");
    await user.selectOptions(within(row).getByLabelText("Paket"), "pk1");
    expect(row).toHaveTextContent("4× Facial Brightening, 28 kapsul Slimming Capsule");
    expect(row).not.toHaveTextContent("Rp");
    await user.click(within(row).getByRole("button", { name: "Hapus paket 1" }));
    expect(screen.queryByRole("group", { name: "Paket 1" })).toBeNull();
  });
});
