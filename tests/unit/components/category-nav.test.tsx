import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDUCED_MOTION_QUERY } from "@/components/motion/use-motion-prefs";
import { CategoryNav } from "@/components/public/category-nav";
import { categoryAnchorId } from "@/lib/category-anchor";
import { setMediaMatches, triggerIntersection } from "../helpers/browser-mocks";

const CATEGORIES = [
  { slug: "facial", name: "Facial Treatment" },
  { slug: "rf", name: "RF Treatment" },
  { slug: "hifu", name: "HIFU Treatment" },
];

function renderServicesPage() {
  render(
    <>
      <CategoryNav categories={CATEGORIES} />
      {CATEGORIES.map((category) => (
        <section key={category.slug} id={categoryAnchorId(category.slug)} data-category={category.slug}>
          <h2>{category.name}</h2>
        </section>
      ))}
    </>,
  );
}

const chip = (name: string) => screen.getByRole("link", { name });

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("CategoryNav", () => {
  it("berupa jangkar biasa ke bagian kategori, dengan chip pertama menyala", () => {
    renderServicesPage();
    expect(categoryAnchorId("rf")).toBe("bagian-rf");
    expect(chip("RF Treatment")).toHaveAttribute("href", "#bagian-rf");
    expect(chip("Facial Treatment")).toHaveAttribute("aria-current", "true");
  });

  it("menyala mengikuti kategori yang sedang terlihat", () => {
    renderServicesPage();
    act(() => triggerIntersection(document.getElementById("bagian-rf") as HTMLElement, true));
    expect(chip("RF Treatment")).toHaveAttribute("aria-current", "true");
    expect(chip("Facial Treatment")).not.toHaveAttribute("aria-current");
  });

  it("menggulir halus ke kategori saat chip diklik dan mencatatnya di alamat halaman", async () => {
    const user = userEvent.setup();
    renderServicesPage();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    await user.click(chip("HIFU Treatment"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scroll.mock.contexts[0]).toBe(document.getElementById("bagian-hifu"));
    expect(window.location.hash).toBe("#bagian-hifu");
    expect(chip("HIFU Treatment")).toHaveAttribute("aria-current", "true");
  });

  it("langsung melompat ke kategori bila kurangi gerakan", async () => {
    setMediaMatches(REDUCED_MOTION_QUERY, true);
    const user = userEvent.setup();
    renderServicesPage();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    await user.click(chip("RF Treatment"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});

describe("baris chip kategori", () => {
  it("hanya digeser bila chip aktif terpotong, dan tidak memotong chip di kiri", () => {
    // Baris chip berada di tengah (mx-auto), jadi posisinya tidak mulai dari 0.
    const boxes: Record<string, { left: number; right: number }> = {
      row: { left: 64, right: 1216 },
      facial: { left: 64, right: 220 },
      rf: { left: 1100, right: 1300 },
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.chip ?? ("chipRow" in this.dataset ? "row" : "");
      const box = boxes[key] ?? { left: 0, right: 0 };
      return { ...box, top: 0, bottom: 0, width: box.right - box.left, height: 0, x: box.left, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
    renderServicesPage();

    // Chip pertama sudah terlihat utuh: baris tidak digeser.
    expect(scrollTo).not.toHaveBeenCalled();

    act(() => triggerIntersection(document.getElementById("bagian-rf") as HTMLElement, true));
    expect(scrollTo).toHaveBeenCalledWith({ left: 1100 - 64 - 16, behavior: "smooth" });
  });
});
