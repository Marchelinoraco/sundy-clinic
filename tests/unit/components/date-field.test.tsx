import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateField, MonthField } from "@/components/admin/mui/date-field";
import { dateFieldInput, dateFieldValue, setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

function Controlled({ initial = "", onValue, min, max }: { initial?: string; onValue: (value: string) => void; min?: string; max?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField label="Tanggal bayar" value={value} min={min} max={max} onChange={(next) => (setValue(next), onValue(next))} />
      <button type="button" onClick={() => setValue("2026-11-15")}>
        Ganti dari luar
      </button>
      <button type="button" onClick={() => setValue("")}>
        Kosongkan dari luar
      </button>
    </>
  );
}

describe("DateField", () => {
  it("ukuran dan warna fokusnya sama dengan isian teks admin (kecil, sekunder)", () => {
    renderAdmin(<DateField label="Tanggal bayar" value="" onChange={() => {}} />);
    const base = screen.getByRole("group", { name: "Tanggal bayar" });
    expect(base.className).toMatch(/MuiPickersInputBase-colorSecondary/);
    expect(base.className).toMatch(/MuiPickersInputBase-.*[sS]izeSmall/);
  });

  it("tanggal lengkap yang diketik menjadi teks YYYY-MM-DD yang sama persis", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled onValue={onValue} />);
    setDateField("Tanggal bayar", "2026-12-31");
    expect(onValue).toHaveBeenLastCalledWith("2026-12-31");
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-12-31");
    expect(screen.getByRole("button", { name: /Pilih tanggal/ })).toBeInTheDocument();
  });

  it("tanggal mustahil menjadi kosong", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled initial="2026-10-01" onValue={onValue} />);
    fireEvent.change(dateFieldInput("Tanggal bayar"), { target: { value: "31/02/2026" } });
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("nilai dari luar mengganti dan mengosongkan isian", () => {
    renderAdmin(<Controlled initial="2026-10-01" onValue={vi.fn()} />);
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-10-01");
    fireEvent.click(screen.getByRole("button", { name: "Ganti dari luar" }));
    expect(dateFieldValue("Tanggal bayar")).toBe("2026-11-15");
    fireEvent.click(screen.getByRole("button", { name: "Kosongkan dari luar" }));
    expect(dateFieldValue("Tanggal bayar")).toBe("");
  });

  it("tanggal di luar min/max tetap diteruskan (validasi tetap di aturan yang ada)", () => {
    const onValue = vi.fn();
    renderAdmin(<Controlled onValue={onValue} min="2026-10-01" max="2026-10-08" />);
    setDateField("Tanggal bayar", "2026-10-20");
    expect(onValue).toHaveBeenLastCalledWith("2026-10-20");
  });

  it("dengan name: formulir mengirim YYYY-MM-DD lewat input tersembunyi, bukan teks DD/MM/YYYY", () => {
    renderAdmin(
      <form aria-label="Filter">
        <DateField label="Dari tanggal" name="dari" defaultValue="2026-10-01" />
      </form>,
    );
    const form = screen.getByRole("form", { name: "Filter" }) as HTMLFormElement;
    expect(new FormData(form).getAll("dari")).toEqual(["2026-10-01"]);
    setDateField("Dari tanggal", "2026-10-15");
    expect(new FormData(form).getAll("dari")).toEqual(["2026-10-15"]);
  });
});

describe("MonthField", () => {
  it("bulan MM/YYYY ↔ YYYY-MM, termasuk lewat name", () => {
    const onChange = vi.fn();
    renderAdmin(
      <form aria-label="Bulan">
        <MonthField label="Bulan" name="bulan" defaultValue="2026-10" onChange={onChange} />
      </form>,
    );
    expect(dateFieldValue("Bulan")).toBe("2026-10");
    setDateField("Bulan", "2026-03");
    expect(onChange).toHaveBeenLastCalledWith("2026-03");
    expect(new FormData(screen.getByRole("form", { name: "Bulan" }) as HTMLFormElement).getAll("bulan")).toEqual(["2026-03"]);
  });
});
