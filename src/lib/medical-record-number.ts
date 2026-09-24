/** Format nomor rekam medis: SDY-2026-0001. */
export function formatMedicalRecordNumber(year: number, sequence: number): string {
  return `SDY-${year}-${String(sequence).padStart(4, "0")}`;
}
