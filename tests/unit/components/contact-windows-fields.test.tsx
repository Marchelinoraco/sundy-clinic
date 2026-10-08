import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContactWindowsFields } from "@/components/admin/contact-windows-fields";
import { EMPTY_WINDOW_DRAFT, type WindowDraft } from "@/lib/online-consultation";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

function Harness({ onValue }: { onValue: (value: WindowDraft[]) => void }) {
  const [value, setValue] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  return <ContactWindowsFields value={value} onChange={(next) => (setValue(next), onValue(next))} minDate="2026-10-06" maxDate="2026-10-20" />;
}

describe("ContactWindowsFields (admin)", () => {
  it("label sama dengan editor publik: isi tanggal dan jam, tambah sampai tiga, hapus", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onValue={onValue} />);
    setDateField("Tanggal waktu 1", "2026-10-08");
    await user.selectOptions(screen.getByLabelText("Jam mulai waktu 1"), String(9 * 60));
    await user.selectOptions(screen.getByLabelText("Jam selesai waktu 1"), String(11 * 60));
    expect(onValue).toHaveBeenLastCalledWith([{ date: "2026-10-08", startMinute: 540, endMinute: 660 }]);
    expect(screen.queryByRole("button", { name: "Hapus waktu 1" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    await user.click(screen.getByRole("button", { name: "+ Tambah waktu" }));
    expect(screen.queryByRole("button", { name: "+ Tambah waktu" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hapus waktu 2" }));
    expect(screen.getByRole("group", { name: "Tanggal waktu 2" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tanggal waktu 3" })).toBeNull();
  });
});
