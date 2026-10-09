import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IntakeClinicalContent } from "@/components/admin/intake-clinical-content";
import { habitTable } from "@/lib/kuis/v2/describe";
import { nutritionNewPatient } from "../../fixtures/quiz-answers-v2";
import { renderAdmin } from "../helpers/render-admin";

const habits = habitTable(nutritionNewPatient.habits);
const clinical = { sections: [], activities: null, activityDateLabel: null, habits };
const filled = habits.rows.filter((row) => row.entries.length > 0).length;

describe("IntakeClinicalContent", () => {
  it("mode ringkas hanya menampilkan jam berisi, lalu bisa dibuka penuh dan ditutup lagi", async () => {
    renderAdmin(<IntakeClinicalContent clinical={clinical} compact />);
    const table = screen.getByRole("table", { name: "Kebiasaan sehari" });
    expect(within(table).getAllByRole("row")).toHaveLength(filled + 1);

    await userEvent.click(screen.getByRole("button", { name: "Tampilkan 06.00–22.00" }));
    expect(within(table).getAllByRole("row")).toHaveLength(habits.rows.length + 1);

    await userEvent.click(screen.getByRole("button", { name: "Sembunyikan jam kosong" }));
    expect(within(table).getAllByRole("row")).toHaveLength(filled + 1);
  });

  it("mode biasa (halaman isian) menampilkan semua jam tanpa tombol", () => {
    renderAdmin(<IntakeClinicalContent clinical={clinical} />);
    expect(within(screen.getByRole("table", { name: "Kebiasaan sehari" })).getAllByRole("row")).toHaveLength(habits.rows.length + 1);
    expect(screen.queryByRole("button", { name: "Tampilkan 06.00–22.00" })).not.toBeInTheDocument();
  });
});
