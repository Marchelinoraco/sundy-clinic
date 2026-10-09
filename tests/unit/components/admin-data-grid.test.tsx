import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GridColDef } from "@mui/x-data-grid";
import NextLink from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDataGrid } from "@/components/admin/mui/admin-data-grid";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

type Row = { id: string; name: string; total: number };
const columns: GridColDef<Row>[] = [
  { field: "name", headerName: "Nama", flex: 1, minWidth: 160, renderCell: ({ row }) => <NextLink href={`/admin/x/${row.id}`}>{row.name}</NextLink> },
  { field: "total", headerName: "Total", type: "number", width: 120 },
];
const many = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Baris ${String(i + 1).padStart(3, "0")}`, total: i }));
const dataRows = () => within(screen.getByRole("grid", { name: "Daftar uji" })).getAllByRole("row").slice(1);

beforeEach(() => mockGridLayout());

describe("AdminDataGrid", () => {
  it("0 baris: teks kosong lama, tanpa tabel", () => {
    renderAdmin(<AdminDataGrid rows={[]} columns={columns} label="Daftar uji" emptyText="Tidak ada data di tampilan ini." />);
    expect(screen.getByText("Tidak ada data di tampilan ini.")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("1 baris: tautan di sel bisa diklik; tanpa kaki halaman", () => {
    renderAdmin(<AdminDataGrid rows={many(1)} columns={columns} label="Daftar uji" emptyText="-" />);
    expect(screen.getByRole("link", { name: "Baris 001" })).toHaveAttribute("href", "/admin/x/r1");
    expect(screen.queryByText(/dari 1$/)).toBeNull();
  });

  it("300 baris: 25 per halaman dengan kaki halaman berbahasa Indonesia", async () => {
    renderAdmin(<AdminDataGrid rows={many(300)} columns={columns} label="Daftar uji" emptyText="-" />);
    expect(dataRows()).toHaveLength(25);
    expect(screen.getByText("1–25 dari 300")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /halaman berikutnya/i }));
    expect(screen.getByText("26–50 dari 300")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baris 026" })).toBeInTheDocument();
  });

  it("urut kolom: klik judul Nama dua kali → menurun", async () => {
    renderAdmin(<AdminDataGrid rows={many(3)} columns={columns} label="Daftar uji" emptyText="-" />);
    const header = screen.getByRole("columnheader", { name: /Nama/ });
    await userEvent.click(header);
    await userEvent.click(header);
    expect(dataRows()[0]).toHaveTextContent("Baris 003");
  });

  it("urutan awal dari initialSort", () => {
    renderAdmin(<AdminDataGrid rows={many(3)} columns={columns} label="Daftar uji" emptyText="-" initialSort={[{ field: "total", sort: "desc" }]} />);
    expect(dataRows()[0]).toHaveTextContent("Baris 003");
  });

  it("highlightId: tepat satu baris bertanda, halaman tempat baris itu dibuka, dan digulir ke layar", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    renderAdmin(<AdminDataGrid rows={many(60)} columns={columns} label="Daftar uji" emptyText="-" highlightId="r40" />);
    const marked = document.querySelectorAll('[role="row"][data-highlighted="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("Baris 040");
    expect(screen.getByText("26–50 dari 60")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
  });

  it("highlightId: dipusatkan ulang selama tinggi halaman masih berubah, berhenti setelah pengguna menggulir", () => {
    // DataGrid mengukur tinggi baris setelah terpasang dan tabel lain di halaman ikut tumbuh, sehingga baris
    // yang sudah digulir bisa terdorong keluar layar (E2E admin-booking).
    const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
    const original = window.ResizeObserver;
    window.ResizeObserver = class {
      targets: Element[] = [];
      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.targets = [];
      }
    } as unknown as typeof ResizeObserver;
    const bodyObserver = () => observers.find((observer) => observer.targets.includes(document.body));
    try {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      renderAdmin(<AdminDataGrid rows={many(60)} columns={columns} label="Daftar uji" emptyText="-" highlightId="r40" />);
      const before = scroll.mock.calls.length;
      bodyObserver()!.callback([], {} as ResizeObserver);
      expect(scroll.mock.calls.length).toBe(before + 1);

      window.dispatchEvent(new Event("wheel"));
      expect(bodyObserver()).toBeUndefined();
    } finally {
      window.ResizeObserver = original;
    }
  });

  it("highlightId yang tidak ada: tidak ada baris bertanda, halaman pertama", () => {
    renderAdmin(<AdminDataGrid rows={many(30)} columns={columns} label="Daftar uji" emptyText="-" highlightId="tidak-ada" />);
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(screen.getByText("1–25 dari 30")).toBeInTheDocument();
  });
});
