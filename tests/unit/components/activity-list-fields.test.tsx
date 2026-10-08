import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityListFields } from "@/components/admin/activity-list-fields";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { renderAdmin } from "../helpers/render-admin";

function Harness({ onValue }: { onValue: (entries: ActivityEntry[]) => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([{ hour: 12, kind: "MAKAN_MINUM", text: "Nasi ikan" }]);
  return <ActivityListFields entries={entries} onChange={(next) => (setEntries(next), onValue(next))} />;
}

describe("ActivityListFields (admin)", () => {
  it("menambah catatan pada jam dan jenis terpilih, urut menurut jam, dan bisa dihapus", async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<Harness onValue={onValue} />);
    await user.selectOptions(screen.getByLabelText("Jam"), "7");
    const kinds = screen.getByRole("radiogroup", { name: "Jenis catatan" });
    await user.click(within(kinds).getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "＋ Tambah catatan" })).toBeDisabled();
    await user.type(screen.getByLabelText("Isi catatan"), "Teh tawar{Enter}");
    expect(onValue).toHaveBeenLastCalledWith([
      { hour: 12, kind: "MAKAN_MINUM", text: "Nasi ikan" },
      expect.objectContaining({ hour: 7, text: "Teh tawar" }),
    ]);
    const items = within(screen.getByRole("list", { name: "Catatan aktivitas" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Teh tawar");
    await user.click(screen.getByRole("button", { name: "Hapus Nasi ikan" }));
    expect(onValue).toHaveBeenLastCalledWith([expect.objectContaining({ text: "Teh tawar" })]);
  });
});
