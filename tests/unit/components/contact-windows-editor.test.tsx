import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { EMPTY_WINDOW_DRAFT, type WindowDraft } from "@/lib/online-consultation";

function Harness({ onValue }: { onValue?: (value: WindowDraft[]) => void }) {
  const [value, setValue] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  return (
    <ContactWindowsEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      minDate="2026-10-06"
      maxDate="2026-10-20"
    />
  );
}

describe("ContactWindowsEditor", () => {
  it("satu rentang di awal, bisa ditambah sampai tiga lalu dihapus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveAttribute("min", "2026-10-06");
    expect(screen.getByLabelText("Tanggal waktu 1")).toHaveAttribute("max", "2026-10-20");
    expect(screen.queryByRole("button", { name: "Hapus waktu 1" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    expect(screen.getByLabelText("Tanggal waktu 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Tambah waktu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hapus waktu 2" }));
    expect(screen.queryByLabelText("Tanggal waktu 3")).not.toBeInTheDocument();
  });

  it("jam dipilih per 30 menit dalam batas 08.00–21.00", async () => {
    const user = userEvent.setup();
    const seen: WindowDraft[][] = [];
    render(<Harness onValue={(value) => seen.push(value)} />);
    const start = screen.getByLabelText("Jam mulai waktu 1");
    expect(screen.getAllByRole("option", { name: "08.00" }).length).toBeGreaterThan(0);
    expect(start.querySelectorAll("option")[0]).toHaveTextContent("08.00");
    expect(start.querySelectorAll("option")[start.querySelectorAll("option").length - 1]).toHaveTextContent("20.00");

    await user.selectOptions(start, "600");
    await user.selectOptions(screen.getByLabelText("Jam selesai waktu 1"), "720");
    expect(seen.at(-1)).toEqual([{ date: "", startMinute: 600, endMinute: 720 }]);
  });
});
