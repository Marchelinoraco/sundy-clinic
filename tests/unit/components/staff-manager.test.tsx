import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffManager } from "@/components/admin/staff/staff-manager";
import { changeStaffEmail, createAccountForStaff, createStaffWithAccount, resetStaffPassword, setStaffActive, updateStaff, type StaffRow } from "@/server/staff";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/staff", () => ({
  createStaffWithAccount: vi.fn(),
  createAccountForStaff: vi.fn(),
  updateStaff: vi.fn(),
  setStaffActive: vi.fn(),
  resetStaffPassword: vi.fn(),
  changeStaffEmail: vi.fn(),
}));

const row = (patch: Partial<StaffRow>): StaffRow => ({ id: "x", name: "X", role: "RESEPSIONIS", showOnWebsite: false, isActive: true, email: null, mustChangePassword: false, ...patch });
const OWNER = row({ id: "s-owner", name: "Pemilik SunDY", role: "SUPER_ADMIN", email: "admin@sundyclinic.com" });
const DOKTER = row({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER" });
const TERAPIS = row({ id: "s-terapis", name: "Terapis Mahakeret", role: "TERAPIS" });
const BARU = row({ id: "s-baru", name: "Rina Baru", role: "RESEPSIONIS", email: "rina@sundy.test", mustChangePassword: true });
const OFF = row({ id: "s-off", name: "Budi Berhenti", role: "APOTEKER", email: "budi@sundy.test", isActive: false });
const ROWS = [OWNER, DOKTER, TERAPIS, BARU, OFF];

const TEMP = "Ab3dEfGhJkMnPqRs";
const credentials = { email: "rina@sundy.test", tempPassword: TEMP };

function renderManager(rows = ROWS) {
  return renderAdmin(<StaffManager rows={rows} currentStaffId="s-owner" />);
}
async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Aksi lain ${name}` }));
  return screen.getByRole("menu");
}
const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((i) => i.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockGridLayout();
});

describe("daftar dan menu aksi", () => {
  it("menampilkan email, 'Belum punya akun', tanda wajib ganti, dan status", () => {
    renderManager();
    const grid = screen.getByRole("grid", { name: "Daftar staf" });
    expect(within(grid).getByText("admin@sundyclinic.com")).toBeInTheDocument();
    expect(within(grid).getAllByText("Belum punya akun")).toHaveLength(2);
    expect(within(grid).getByText("Wajib ganti kata sandi")).toBeInTheDocument();
    expect(within(grid).getByText("Nonaktif")).toBeInTheDocument();
  });

  it("menu tiap baris hanya berisi aksi yang berlaku", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(items(await openMenu(user, "Dr. Diane"))).toEqual(["Ubah", "Buat akun", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Terapis Mahakeret"))).toEqual(["Ubah", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Rina Baru"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email", "Nonaktifkan"]);
    await user.keyboard("{Escape}");
    expect(items(await openMenu(user, "Budi Berhenti"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email", "Aktifkan"]);
  });

  it("tombol menu memberi tahu pembaca layar status dan menu yang dikendalikannya", async () => {
    const user = userEvent.setup();
    renderManager();
    const button = screen.getByRole("button", { name: "Aksi lain Dr. Diane" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", screen.getByRole("menu").closest("[id]")?.id);
    // Tombol baris lain tetap tertutup.
    // Saat menu terbuka sisa halaman disembunyikan dari pohon aksesibilitas, jadi dicari dengan hidden: true.
    expect(screen.getByRole("button", { name: "Aksi lain Rina Baru", hidden: true })).toHaveAttribute("aria-expanded", "false");
  });

  it("chip 'Wajib ganti kata sandi' ada di kolom Status, bukan di kolom Akun", () => {
    renderManager();
    const rina = screen.getByRole("row", { name: /Rina Baru/ });
    const cells = within(rina).getAllByRole("gridcell");
    const account = cells.find((c) => c.getAttribute("data-field") === "email")!;
    const status = cells.find((c) => c.getAttribute("data-field") === "isActive")!;
    expect(within(account).queryByText("Wajib ganti kata sandi")).toBeNull();
    expect(within(status).getByText("Wajib ganti kata sandi")).toBeInTheDocument();
  });

  it("pemilik tidak punya 'Nonaktifkan' untuk dirinya sendiri, tetapi boleh mereset akunnya", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(items(await openMenu(user, "Pemilik SunDY"))).toEqual(["Ubah", "Reset kata sandi", "Ganti email"]);
  });
});

describe("tambah staf", () => {
  it("mengirim isian, menampilkan kata sandi sementara satu kali, dan menghapusnya dari layar saat ditutup", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: true, data: { staffId: "baru", credentials } });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    await user.type(within(form).getByLabelText("Nama"), "Rina Baru");
    await user.selectOptions(within(form).getByLabelText("Peran"), "RESEPSIONIS");
    await user.type(within(form).getByLabelText("Email login"), "rina@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));

    await waitFor(() => expect(createStaffWithAccount).toHaveBeenCalledWith({ name: "Rina Baru", role: "RESEPSIONIS", showOnWebsite: false, email: "rina@sundy.test" }));
    const temp = await screen.findByRole("dialog", { name: "Kata sandi sementara — Rina Baru" });
    expect(within(temp).getByTestId("kata-sandi-sementara")).toHaveTextContent(TEMP);
    expect(within(temp).getByText("rina@sundy.test")).toBeInTheDocument();
    expect(within(temp).getByText(/hanya tampil sekali/i)).toBeInTheDocument();

    await user.click(within(temp).getByRole("button", { name: "Salin kata sandi" }));
    expect(await navigator.clipboard.readText()).toBe(TEMP);

    await user.click(within(temp).getByRole("button", { name: "Tutup" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Kata sandi sementara/ })).toBeNull());
    expect(screen.queryByText(TEMP)).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("peran Terapis menyembunyikan isian email dan tidak meminta akun", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: true, data: { staffId: "t", credentials: null } });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    expect(within(form).getByLabelText("Email login")).toBeInTheDocument();
    await user.selectOptions(within(form).getByLabelText("Peran"), "TERAPIS");
    expect(within(form).queryByLabelText("Email login")).toBeNull();
    expect(within(form).getByText("Terapis tidak punya akun login.")).toBeInTheDocument();
    await user.type(within(form).getByLabelText("Nama"), "Terapis Baru");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));
    await waitFor(() => expect(createStaffWithAccount).toHaveBeenCalledWith({ name: "Terapis Baru", role: "TERAPIS", showOnWebsite: false, email: undefined }));
    expect(screen.queryByRole("dialog", { name: /Kata sandi sementara/ })).toBeNull();
  });

  it("galat dari server tampil di dalam dialog dan dialog tetap terbuka", async () => {
    vi.mocked(createStaffWithAccount).mockResolvedValue({ ok: false, error: "Email ini sudah dipakai akun lain." });
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "+ Tambah staf" }));
    const form = await screen.findByRole("dialog", { name: "Tambah staf" });
    await user.type(within(form).getByLabelText("Nama"), "Dobel");
    await user.type(within(form).getByLabelText("Email login"), "ada@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Tambah staf" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Email ini sudah dipakai akun lain.");
    expect(screen.getByRole("dialog", { name: "Tambah staf" })).toBeInTheDocument();
  });
});

describe("dialog kata sandi sementara", () => {
  it("untuk staf lain: Esc tidak menutup dan tidak ada kotak konfirmasi; Tutup langsung aktif", async () => {
    vi.mocked(resetStaffPassword).mockResolvedValue({ ok: true, data: { credentials } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Reset kata sandi" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset kata sandi" }));
    const temp = await screen.findByRole("dialog", { name: "Kata sandi sementara — Rina Baru" });
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Kata sandi sementara — Rina Baru" })).toBeInTheDocument();
    expect(within(temp).queryByLabelText("Saya sudah menyimpan kata sandi ini")).toBeNull();
    expect(temp).toHaveAccessibleDescription(/hanya tampil sekali/);
    expect(within(temp).getByRole("button", { name: "Tutup" })).toBeEnabled();
  });
});

describe("ganti email diri sendiri", () => {
  it("memperingatkan akan keluar dan meminta email diketik dua kali; yang berbeda ditolak sebelum dikirim", async () => {
    vi.mocked(changeStaffEmail).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Pemilik SunDY");
    await user.click(screen.getByRole("menuitem", { name: "Ganti email" }));
    const form = await screen.findByRole("dialog", { name: "Ganti email — Pemilik SunDY" });
    expect(within(form).getByText(/Anda akan keluar dari semua perangkat dan harus masuk lagi dengan email baru/)).toBeInTheDocument();
    const field = within(form).getByLabelText("Email login");
    await user.clear(field);
    await user.type(field, "baru@sundy.test");
    await user.type(within(form).getByLabelText("Ulangi email baru"), "beda@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Ganti email" }));
    expect(await within(form).findByText("Email ulangan tidak sama.")).toBeInTheDocument();
    expect(changeStaffEmail).not.toHaveBeenCalled();

    await user.clear(within(form).getByLabelText("Ulangi email baru"));
    await user.type(within(form).getByLabelText("Ulangi email baru"), " BARU@sundy.test ");
    await user.click(within(form).getByRole("button", { name: "Ganti email" }));
    await waitFor(() => expect(changeStaffEmail).toHaveBeenCalledWith({ staffId: "s-owner", email: "baru@sundy.test" }));
  });

  it("untuk staf lain tidak ada peringatan keluar dan tidak ada isian ulangan", async () => {
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Ganti email" }));
    const form = await screen.findByRole("dialog", { name: "Ganti email — Rina Baru" });
    expect(within(form).queryByLabelText("Ulangi email baru")).toBeNull();
    expect(within(form).queryByText(/Anda akan keluar/)).toBeNull();
  });
});

describe("aksi per baris", () => {
  it("Ubah: mengirim nama, peran, dan tampil di situs", async () => {
    vi.mocked(updateStaff).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Dr. Diane");
    await user.click(screen.getByRole("menuitem", { name: "Ubah" }));
    const form = await screen.findByRole("dialog", { name: "Ubah — Dr. Diane" });
    expect(within(form).getByLabelText("Nama")).toHaveValue("Dr. Diane");
    expect(within(form).queryByLabelText("Email login")).toBeNull();
    await user.click(within(form).getByLabelText("Tampil di situs publik"));
    await user.click(within(form).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith({ id: "s-dokter", name: "Dr. Diane", role: "DOKTER", showOnWebsite: true }));
  });

  it("Buat akun: meminta email lalu menampilkan kata sandi sementara", async () => {
    vi.mocked(createAccountForStaff).mockResolvedValue({ ok: true, data: { credentials: { email: "diane@sundy.test", tempPassword: TEMP } } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Dr. Diane");
    await user.click(screen.getByRole("menuitem", { name: "Buat akun" }));
    const form = await screen.findByRole("dialog", { name: "Buat akun — Dr. Diane" });
    await user.type(within(form).getByLabelText("Email login"), "diane@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Buat akun" }));
    await waitFor(() => expect(createAccountForStaff).toHaveBeenCalledWith({ staffId: "s-dokter", email: "diane@sundy.test" }));
    expect(await screen.findByRole("dialog", { name: "Kata sandi sementara — Dr. Diane" })).toBeInTheDocument();
  });

  it("Ganti email: terisi email sekarang dan mengirim yang baru", async () => {
    vi.mocked(changeStaffEmail).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Ganti email" }));
    const form = await screen.findByRole("dialog", { name: "Ganti email — Rina Baru" });
    const field = within(form).getByLabelText("Email login");
    expect(field).toHaveValue("rina@sundy.test");
    await user.clear(field);
    await user.type(field, "rina.baru@sundy.test");
    await user.click(within(form).getByRole("button", { name: "Ganti email" }));
    await waitFor(() => expect(changeStaffEmail).toHaveBeenCalledWith({ staffId: "s-baru", email: "rina.baru@sundy.test" }));
  });

  it("Nonaktifkan: konfirmasi menjelaskan akibatnya; galat server tampil di dialog", async () => {
    vi.mocked(setStaffActive).mockResolvedValueOnce({ ok: false, error: "Harus tersisa minimal satu Super Admin aktif yang punya akun." }).mockResolvedValueOnce({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Nonaktifkan" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Nonaktifkan Rina Baru?" });
    expect(confirm).toHaveAccessibleDescription(/langsung keluar dari semua perangkat/);
    await user.click(within(confirm).getByRole("button", { name: "Nonaktifkan" }));
    expect(await within(confirm).findByText("Harus tersisa minimal satu Super Admin aktif yang punya akun.")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(setStaffActive).toHaveBeenLastCalledWith("s-baru", false));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("Aktifkan langsung jalan tanpa konfirmasi", async () => {
    vi.mocked(setStaffActive).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Budi Berhenti");
    await user.click(screen.getByRole("menuitem", { name: "Aktifkan" }));
    await waitFor(() => expect(setStaffActive).toHaveBeenCalledWith("s-off", true));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Reset kata sandi staf lain: konfirmasi, lalu kata sandi sementara", async () => {
    vi.mocked(resetStaffPassword).mockResolvedValue({ ok: true, data: { credentials } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Rina Baru");
    await user.click(screen.getByRole("menuitem", { name: "Reset kata sandi" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reset kata sandi Rina Baru?" });
    expect(confirm).not.toHaveAccessibleDescription(/Anda akan keluar/);
    await user.click(within(confirm).getByRole("button", { name: "Reset kata sandi" }));
    expect(await screen.findByRole("dialog", { name: "Kata sandi sementara — Rina Baru" })).toBeInTheDocument();
    expect(resetStaffPassword).toHaveBeenCalledWith("s-baru");
  });

  it("Reset kata sandi sendiri: peringatan keluar; refresh ditunda sampai dialog ditutup, lalu ke /masuk", async () => {
    vi.mocked(resetStaffPassword).mockResolvedValue({ ok: true, data: { credentials: { email: "admin@sundyclinic.com", tempPassword: TEMP } } });
    const user = userEvent.setup();
    renderManager();
    await openMenu(user, "Pemilik SunDY");
    await user.click(screen.getByRole("menuitem", { name: "Reset kata sandi" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reset kata sandi Pemilik SunDY?" });
    expect(confirm).toHaveAccessibleDescription(/Anda akan keluar dari semua perangkat/);
    await user.click(within(confirm).getByRole("button", { name: "Reset kata sandi" }));
    const temp = await screen.findByRole("dialog", { name: "Kata sandi sementara — Pemilik SunDY" });
    expect(refresh).not.toHaveBeenCalled();
    // Pemilik tunggal yang tak sengaja menutup dialog ini terkunci dari panel: Esc diabaikan dan Tutup menunggu konfirmasi.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Kata sandi sementara — Pemilik SunDY" })).toBeInTheDocument();
    expect(within(temp).getByRole("button", { name: "Tutup" })).toBeDisabled();
    await user.click(within(temp).getByLabelText("Saya sudah menyimpan kata sandi ini"));
    await user.click(within(temp).getByRole("button", { name: "Tutup" }));
    expect(push).toHaveBeenCalledWith("/masuk");
  });
});
