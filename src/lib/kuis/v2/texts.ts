import type { QuizAnswers } from "./answers";
import type { StepId } from "./steps";

const MULTI = "Boleh pilih lebih dari satu.";

const PORTION_EXAMPLE =
  "Tulis makanan dan minuman beserta porsinya. Contoh: nasi 1 piring, paha ayam goreng 1 potong, sayur kol tumis 1 centong, kopi hitam tanpa gula 1 gelas. Ini membantu dokter menyusun program yang pas untuk Anda.";

/**
 * Judul dan petunjuk tiap layar kuis v2 — bagian dari kata-kata yang ditinjau
 * dokter. Customer disapa "Anda"; kata "pasien" dan "berobat" tidak dipakai
 * (spec kuis v2, V8).
 */
export function stepText(step: StepId, a: QuizAnswers): { title: string; hint?: string } {
  switch (step) {
    case "U1":
      return { title: "Pernah konsultasi atau treatment di SunDY Clinic?" };
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
    case "N1":
      return {
        title: "Apa yang ingin Anda konsultasikan ke dokter gizi klinik?",
        hint: "Misalnya gula darah, kolesterol, asam urat, maag, atau berat badan. Dokter kami membacanya sebelum Anda datang.",
      };
    case "T1":
      return {
        title: "Berat & tinggi badan Anda",
        hint: "Ukuran sendiri saja. Dokter akan memastikannya dengan Timbang BIA di klinik.",
      };
    case "F1":
      return { title: "Jam berapa Anda biasanya bangun dan tidur?", hint: "Kira-kira saja, pada hari biasa." };
    case "F2":
      return { title: "Sarapan", hint: PORTION_EXAMPLE };
    case "F3":
      return { title: "Makan siang", hint: PORTION_EXAMPLE };
    case "F4":
      return { title: "Makan malam", hint: PORTION_EXAMPLE };
    case "F5":
      return { title: "Cemilan", hint: "Contoh: kerupuk, bakwan goreng, pisang goreng, permen, cokelat, martabak." };
    case "F6":
      return { title: "Olahraga", hint: "Contoh: jalan kaki, gym, renang, senam." };
    case "F7":
      return { title: "Rokok, alkohol, dan minuman bersoda" };
    case "A1":
      return { title: "Apa yang paling mengganggu Anda?", hint: MULTI };
    case "A2":
      return { title: "Bagaimana kulit wajah Anda?" };
    case "A3":
      return { title: "Sudah berapa lama keluhan ini?" };
    case "A4":
      return { title: "Pernah treatment di klinik lain?", hint: MULTI };
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
      return { title: "Bagaimana perkembangan Anda sejak konsultasi terakhir? Ada keluhan?" };
    case "P2":
      return { title: "Ada perubahan penyakit atau obat sejak kunjungan terakhir?" };
  }
}
