import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "@/components/admin/mui/select-field";
import { renderAdmin } from "../helpers/render-admin";

describe("SelectField", () => {
  it("tetap <select> asli berlabel; memilih memanggil onChange dengan nilai opsi", async () => {
    const onChange = vi.fn();
    renderAdmin(
      <SelectField label="Kategori" value="" onChange={onChange}>
        <option value="">Pilih kategori</option>
        <option value="kat1">Sewa</option>
      </SelectField>,
    );
    const select = screen.getByLabelText("Kategori");
    expect(select.tagName).toBe("SELECT");
    await userEvent.selectOptions(select, "kat1");
    expect(onChange).toHaveBeenCalledWith("kat1");
  });

  it("tanpa label tampil: aria-label; name ikut terkirim", () => {
    renderAdmin(
      <form aria-label="F">
        <SelectField aria-label="Cabang" name="cabang" defaultValue="b1">
          <option value="">Semua cabang</option>
          <option value="b1">Mahakeret</option>
        </SelectField>
      </form>,
    );
    expect(screen.getByLabelText("Cabang")).toHaveValue("b1");
    expect(new FormData(screen.getByRole("form", { name: "F" }) as HTMLFormElement).get("cabang")).toBe("b1");
  });
});
