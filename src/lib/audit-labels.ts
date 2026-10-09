/** Bahasa manusia untuk "Jejak catatan ini" (spec bagian 9). */
const ACTION_LABEL: Record<string, string> = {
  "encounter.create": "membuat kunjungan",
  "encounter.edit-draft": "mengubah draf",
  "encounter.finalize": "memfinalisasi",
  "encounter.discard": "membuang draf",
  "encounter.addendum": "menambah adendum",
  "encounter.view": "membuka",
  "bia.upload": "mengunggah hasil BIA",
  "bia.numbers.save": "menyimpan angka BIA",
  "bia.void": "membatalkan pengukuran BIA",
  "bia.file.void": "membatalkan berkas BIA",
  "bia.view": "membuka berkas BIA",
  "staff.create": "menambah staf",
  "staff.update": "mengubah data staf",
  "staff.activate": "mengaktifkan staf",
  "staff.deactivate": "menonaktifkan staf",
  "staff.account.create": "membuat akun staf",
  "staff.account.reset": "mereset kata sandi staf",
  "staff.account.email": "mengganti email staf",
  "staff.password.change": "mengganti kata sandi sendiri",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  RESEPSIONIS: "Resepsionis",
  TERAPIS: "Terapis",
  APOTEKER: "Apoteker",
  ADMIN_KEUANGAN: "Admin Keuangan",
  SISTEM: "Sistem",
  PASIEN: "Pasien",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function auditRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
