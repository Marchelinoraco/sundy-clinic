/** Bahasa manusia untuk "Jejak catatan ini" (spec bagian 9). */
const ACTION_LABEL: Record<string, string> = {
  "encounter.create": "membuat kunjungan",
  "encounter.edit-draft": "mengubah draf",
  "encounter.finalize": "memfinalisasi",
  "encounter.discard": "membuang draf",
  "encounter.addendum": "menambah adendum",
  "encounter.view": "membuka",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  RESEPSIONIS: "Resepsionis",
  TERAPIS: "Terapis",
  SISTEM: "Sistem",
  PASIEN: "Pasien",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function auditRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
