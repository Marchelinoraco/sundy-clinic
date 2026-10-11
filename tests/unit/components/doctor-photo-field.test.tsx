import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorPhotoField } from "@/components/admin/staff/doctor-photo-field";
import { sendStaffPhoto } from "@/components/admin/staff/send-photo";
import { removeStaffPhoto } from "@/server/staff";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/staff/send-photo", () => ({ sendStaffPhoto: vi.fn() }));
vi.mock("@/server/staff", () => ({ removeStaffPhoto: vi.fn() }));

const picture = () => new File(["x"], "dokter.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:pratinjau");
  URL.revokeObjectURL = vi.fn();
});

describe("isian foto dokter", () => {
  it("tanpa foto: keterangan, tombol Pilih foto, tanpa Hapus foto", () => {
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={() => {}} />);
    expect(screen.getByText("Belum ada foto unggahan. Situs memakai foto bawaan bila ada.")).toBeInTheDocument();
    expect(screen.getByText(/Foto potret \(tegak\) paling bagus, minimal 600 px\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih foto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus foto" })).toBeNull();
  });

  it("dengan foto: tampil di bingkai dan ada Hapus foto", () => {
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={() => {}} />);
    expect(screen.getByRole("img", { name: "Foto saat ini" })).toHaveAttribute("src", "/foto-dokter/s1-0a1b2c3d.webp");
    expect(screen.getByRole("button", { name: "Hapus foto" })).toBeInTheDocument();
  });

  it("memilih berkas menampilkan pratinjau dan tombol Pakai foto ini; Batal membuangnya", async () => {
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={() => {}} />);
    await user.upload(screen.getByLabelText("Berkas foto dokter"), picture());
    expect(screen.getByRole("img", { name: "Pratinjau foto baru" })).toHaveAttribute("src", "blob:pratinjau");
    expect(screen.getByText(/langsung tampil di situs saat dipakai, tanpa menunggu tombol Simpan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus foto" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("img", { name: "Pratinjau foto baru" })).toBeNull();
    expect(screen.getByRole("img", { name: "Foto saat ini" })).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pratinjau");
    expect(sendStaffPhoto).not.toHaveBeenCalled();
  });

  it("Pakai foto ini mengunggah, memberi tahu induknya, dan kembali ke tampilan foto", async () => {
    vi.mocked(sendStaffPhoto).mockResolvedValue({ ok: true, photoUrl: "/foto-dokter/s1-aaaaaaaa.webp" });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={onChange} />);
    const file = picture();
    await user.upload(screen.getByLabelText("Berkas foto dokter"), file);
    await user.click(screen.getByRole("button", { name: "Pakai foto ini" }));
    await waitFor(() => expect(sendStaffPhoto).toHaveBeenCalledWith("s1", file));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/foto-dokter/s1-aaaaaaaa.webp"));
    expect(screen.queryByRole("button", { name: "Pakai foto ini" })).toBeNull();
  });

  it("penolakan server tampil di bawah pratinjau; pratinjau dan tombol tetap bisa dipakai lagi", async () => {
    vi.mocked(sendStaffPhoto).mockResolvedValue({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={onChange} />);
    await user.upload(screen.getByLabelText("Berkas foto dokter"), picture());
    await user.click(screen.getByRole("button", { name: "Pakai foto ini" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Foto terlalu kecil. Sisi terpendek minimal 600 px.");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pakai foto ini" })).toBeEnabled();
  });

  it("Hapus foto memanggil aksi dan memberi tahu induknya; galat server tampil", async () => {
    vi.mocked(removeStaffPhoto).mockResolvedValueOnce({ ok: false, error: "Staf ini belum punya foto unggahan." }).mockResolvedValueOnce({ ok: true, data: undefined });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl="/foto-dokter/s1-0a1b2c3d.webp" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Hapus foto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Staf ini belum punya foto unggahan.");
    await user.click(screen.getByRole("button", { name: "Hapus foto" }));
    await waitFor(() => expect(removeStaffPhoto).toHaveBeenLastCalledWith("s1"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it("tombol Pilih foto bisa dipakai lewat papan ketik (Enter dan Spasi membuka pemilih berkas)", async () => {
    const opened = vi.spyOn(HTMLInputElement.prototype, "click");
    const user = userEvent.setup();
    renderAdmin(<DoctorPhotoField staffId="s1" photoUrl={null} onChange={() => {}} />);
    screen.getByRole("button", { name: "Pilih foto" }).focus();
    await user.keyboard("{Enter}");
    expect(opened).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(opened).toHaveBeenCalledTimes(2);
    opened.mockRestore();
  });
});
