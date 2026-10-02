import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, FailedSection, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { StatTile } from "@/components/admin/stat-tile";
import { AdminHeader } from "@/components/admin/admin-header";

vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => <button type="button">Sidebar</button> }));

describe("PageHeader", () => {
  it("judul sebagai satu-satunya h1, keterangan, jejak, dan aksi", () => {
    render(
      <PageHeader
        title="Maria Wenas"
        description="SDY-2026-0012"
        trail={[{ label: "Pasien", href: "/admin/pasien" }, { label: "Maria Wenas" }]}
        actions={<button type="button">+ Booking</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Maria Wenas" })).toBeInTheDocument();
    expect(screen.getByText("SDY-2026-0012")).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: "Jejak halaman" });
    expect(within(trail).getByRole("link", { name: "Pasien" })).toHaveAttribute("href", "/admin/pasien");
    expect(within(trail).getByText("Maria Wenas")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "+ Booking" })).toBeInTheDocument();
  });

  it("tanpa jejak dan aksi tetap rapi", () => {
    render(<PageHeader title="Staf" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Staf" })).toBeInTheDocument();
  });
});

describe("SectionCard", () => {
  it("menjadi region bernama judulnya, dengan aksi di kepala kartu", () => {
    render(
      <SectionCard title="Jadwal hari ini" actions={<a href="/admin/booking">Buka daftar Booking →</a>}>
        <EmptyState>Tidak ada jadwal praktik hari ini.</EmptyState>
      </SectionCard>,
    );
    const card = screen.getByRole("region", { name: "Jadwal hari ini" });
    expect(within(card).getByRole("heading", { level: 2, name: "Jadwal hari ini" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Buka daftar Booking →" })).toBeInTheDocument();
    expect(within(card).getByText("Tidak ada jadwal praktik hari ini.")).toBeInTheDocument();
  });

  it("bagian yang gagal dimuat menulis pesan yang sama", () => {
    render(<FailedSection title="Angka" />);
    expect(within(screen.getByRole("region", { name: "Angka" })).getByText("Gagal dimuat. Muat ulang halaman.")).toBeInTheDocument();
  });
});

describe("PageTabs", () => {
  it("tab aktif ditandai aria-current", () => {
    render(
      <PageTabs
        label="Bagian jadwal"
        active="pengecualian"
        tabs={[
          { id: "jam-kerja", label: "Jam kerja", href: "/admin/jadwal?tab=jam-kerja" },
          { id: "pengecualian", label: "Pengecualian (2)", href: "/admin/jadwal?tab=pengecualian" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Bagian jadwal" });
    expect(within(nav).getByRole("link", { name: "Pengecualian (2)" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Jam kerja" })).not.toHaveAttribute("aria-current");
  });
});

describe("StatTile", () => {
  it("seluruh kotak adalah tautan, dengan varian perlu tindakan", () => {
    const { rerender } = render(
      <StatTile label="Menunggu konfirmasi" value={3} note="1 lewat batas transfer" href="/admin/booking" attention />,
    );
    const tile = screen.getByRole("link", { name: /Menunggu konfirmasi/ });
    expect(tile).toHaveAttribute("href", "/admin/booking");
    expect(tile).toHaveTextContent("3");
    expect(tile).toHaveTextContent("1 lewat batas transfer");
    expect(tile).toHaveAttribute("data-attention", "true");

    rerender(<StatTile label="Booking hari ini" value={0} href="/admin/booking" />);
    expect(screen.getByRole("link", { name: /Booking hari ini/ })).not.toHaveAttribute("data-attention");
  });
});

describe("AdminHeader", () => {
  it("bar atas tidak memakai h1 kecuali diminta", () => {
    const { rerender } = render(<AdminHeader title="Booking" />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("Booking")).toBeInTheDocument();
    rerender(<AdminHeader title="Kunjungan" heading />);
    expect(screen.getByRole("heading", { level: 1, name: "Kunjungan" })).toBeInTheDocument();
  });
});
