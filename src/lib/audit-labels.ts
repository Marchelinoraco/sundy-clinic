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
