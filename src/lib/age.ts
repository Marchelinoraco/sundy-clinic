import { witaDateString } from "./time";

/** Umur dalam tahun penuh pada hari ini (WITA); `birthDate` kolom @db.Date dibaca dari UTC. */
export function ageInYears(birthDate: Date, now: Date): number {
  const [by, bm, bd] = birthDate.toISOString().slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = witaDateString(now).split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}
