import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PackageTabs, type PackageTabGroup } from "@/components/public/package-tabs";

function pkg(slug: string, name: string, items: string[]) {
  return {
    id: slug,
    slug,
    name,
    monthlyPrice: 1000000,
    items: items.map((label, index) => ({ id: `${slug}-${index}`, label })),
  };
}

const GROUPS: PackageTabGroup[] = [
  { groupName: "MAX", tagline: "Shape with Care, Transform with Confidence", packages: [pkg("max", "MAX", ["Kapsul M"])] },
  { groupName: "LUX", tagline: "A More Refined Way to Reach Your Ideal Shape", packages: [pkg("lux", "LUX", ["Kapsul L"])] },
  { groupName: "ACTIVE", tagline: "Personalized Care for Your Best Self", packages: [pkg("lux-t-active", "LUX T ACTIVE", ["Kapsul L"])] },
];

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  window.history.replaceState(null, "", "/program-slimming");
});

describe("PackageTabs", () => {
  it("membuka kelompok awal, dan panel lain tetap ada di HTML tetapi tersembunyi", () => {
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);
    expect(tab("MAX")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "MAX" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
    expect(screen.getByText("Shape with Care, Transform with Confidence")).toBeVisible();
    expect(screen.getByText("LUX T ACTIVE")).not.toBeVisible();
  });

  it("berganti kelompok saat tombol diklik dan menyimpan pilihan di alamat halaman", async () => {
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);

    await user.click(tab("LUX"));
    expect(tab("LUX")).toHaveAttribute("aria-selected", "true");
    expect(tab("MAX")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
    expect(window.location.search).toBe("?paket=lux");
  });

  it("mempertahankan parameter dan jangkar lain di alamat halaman", async () => {
    window.history.replaceState(null, "", "/program-slimming?utm_source=ig#paket");
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);

    await user.click(tab("ACTIVE"));
    expect(window.location.search).toBe("?utm_source=ig&paket=active");
    expect(window.location.hash).toBe("#paket");
  });

  it("berpindah dengan panah kiri/kanan, Home, dan End, dengan fokus ikut pindah", async () => {
    const user = userEvent.setup();
    render(<PackageTabs groups={GROUPS} initialGroup="MAX" />);
    tab("MAX").focus();

    await user.keyboard("{ArrowRight}");
    expect(tab("LUX")).toHaveFocus();
    expect(tab("LUX")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(tab("ACTIVE")).toHaveFocus();

    await user.keyboard("{Home}");
    expect(tab("MAX")).toHaveFocus();

    await user.keyboard("{End}");
    expect(tab("ACTIVE")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Paket ACTIVE" })).toBeVisible();
  });

  it("hanya tombol aktif yang masuk urutan Tab", () => {
    render(<PackageTabs groups={GROUPS} initialGroup="LUX" />);
    expect(tab("LUX")).toHaveAttribute("tabindex", "0");
    expect(tab("MAX")).toHaveAttribute("tabindex", "-1");
    expect(tab("ACTIVE")).toHaveAttribute("tabindex", "-1");
  });

  it("membuka kelompok pertama yang ada bila kelompok awal sedang tanpa paket", () => {
    render(<PackageTabs groups={GROUPS.slice(0, 2)} initialGroup="ACTIVE" />);
    expect(tab("MAX")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
  });
});
