import type { QuizAnswers } from "./answers";
import type { StepId } from "./steps";

const MULTI = "Boleh pilih lebih dari satu.";

/** Judul dan petunjuk tiap layar kuis v1 — bagian dari kata-kata yang ditinjau dokter. */
export function stepText(step: StepId, a: QuizAnswers): { title: string; hint?: string } {
  switch (step) {
    case "U1":
      return { title: "Pernah berobat di SunDY Clinic?" };
    case "U2":
      return { title: "Apa yang ingin Anda konsultasikan?" };
    case "S1":
      return { title: "Apa tujuan utama Anda?" };
    case "S2":
      return { title: "Berapa kg yang ingin diturunkan?" };
    case "S3":
      return { title: "Area mana yang paling ingin dikecilkan?", hint: MULTI };
    case "S4":
      return { title: "Pernah menjalani program diet?" };
    case "S5":
      return { title: "Program diet apa yang pernah dijalani?", hint: MULTI };
    case "S6":
      return { title: "Bagaimana hasilnya?", hint: "Perkiraan juga boleh." };
    case "S7":
      return {
        title: "Berat & tinggi badan Anda",
        hint: "Ukuran sendiri saja. Dokter akan memastikannya dengan Timbang BIA di klinik.",
      };
    case "S8":
      return { title: "Apa yang biasa Anda makan sehari?", hint: "Isi minimal satu: pagi, siang, atau malam." };
    case "A1":
      return { title: "Apa yang paling mengganggu Anda?", hint: MULTI };
    case "A2":
      return { title: "Bagaimana kulit wajah Anda?" };
    case "A3":
      return { title: "Sudah berapa lama keluhan ini?" };
    case "A4":
      return { title: "Pernah treatment di klinik lain?", hint: MULTI };
    case "B1":
      return { title: "Ceritakan keluhan atau tujuan Anda", hint: "Dokter kami membacanya sebelum Anda datang." };
    case "K1":
      return {
        title:
          a.patientType === "LAMA"
            ? "Penyakit atau kondisi Anda saat ini"
            : "Punya riwayat penyakit atau kondisi ini?",
        hint: MULTI,
      };
    case "K2":
      return {
        title: "Obat apa yang Anda minum?",
        hint: "Tulis nama obat & aturan minumnya, sebisanya. Tidak ingat namanya? Tulis “lupa”; dokter akan menanyakannya saat konsultasi.",
      };
    case "K3":
      return {
        title: "Ada obat lain atau alergi?",
        hint: "Termasuk vitamin, suplemen, obat pelangsing, KB, atau obat jerawat.",
      };
    case "K4":
      return { title: "Sedang hamil, merencanakan kehamilan, atau menyusui?" };
    case "P1":
      if (a.purpose === "SLIMMING") return { title: "Bagaimana perkembangan program Anda? Ada keluhan?" };
      if (a.purpose === "AESTHETIC") return { title: "Keluhan atau treatment yang diinginkan kali ini?" };
      return { title: "Ceritakan keluhan atau tujuan Anda" };
    case "P2":
      return { title: "Ada perubahan penyakit atau obat sejak kunjungan terakhir?" };
    case "P3":
      return {
        title: "Apa saja yang Anda lakukan kemarin?",
        hint: "Tambahkan makan, kapsul/obat, dan olahraga beserta jamnya.",
      };
  }
}
