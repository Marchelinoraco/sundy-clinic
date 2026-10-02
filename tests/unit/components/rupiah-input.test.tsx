import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RupiahInput } from "@/components/admin/rupiah-input";
import { parseRupiahText, rupiahInputText } from "@/lib/rupiah-input";

describe("parseRupiahText", () => {
  it("hanya angka yang dibaca, termasuk teks yang ditempel", () => {
    expect(parseRupiahText("189000")).toBe(189000);
    expect(parseRupiahText("Rp 1.000.000")).toBe(1000000);
    expect(parseRupiahText("1.000.000,-")).toBe(1000000);
    expect(parseRupiahText("Rp 99.000 abc")).toBe(99000);
  });

  it("kosong atau tanpa angka berarti null; lebih dari 12 digit dipotong", () => {
    expect(parseRupiahText("")).toBeNull();
    expect(parseRupiahText("Rp ")).toBeNull();
    expect(parseRupiahText("abc")).toBeNull();
    expect(parseRupiahText("1234567890123")).toBe(123456789012);
  });
});

describe("rupiahInputText", () => {
  it("menulis rupiah, atau kosong untuk null", () => {
    expect(rupiahInputText(189000)).toBe("Rp 189.000");
    expect(rupiahInputText(0)).toBe("Rp 0");
    expect(rupiahInputText(null)).toBe("");
  });
});

function Harness({ initial, onChange }: { initial: number | null; onChange: (value: number | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RupiahInput
      aria-label="Harga coret"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("RupiahInput", () => {
  it("diketik sebagai angka dan ditampilkan sebagai rupiah", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={null} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Harga coret" });
    await user.type(input, "189000");
    expect(input).toHaveValue("Rp 189.000");
    expect(onChange).toHaveBeenLastCalledWith(189000);
  });

  it("dikosongkan menjadi null", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={250000} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Harga coret" });
    expect(input).toHaveValue("Rp 250.000");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
