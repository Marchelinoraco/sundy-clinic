import { describe, expect, it } from "vitest";
import { isReturnInterval, RETURN_INTERVALS, returnIntervalLabel, returnIntervalPhrase, treatmentNamesLabel, treatmentReminderMessage } from "@/lib/treatment-reminder";

describe("pesan pengingat treatment (spec pengingat treatment PT7, PT11)", () => {
  it("isi pesan persis", () => {
    expect(treatmentReminderMessage({ patientName: "Rina Wulandari", treatments: ["Facial Brightening"], treatmentOn: "2026-10-17", intervalDays: 7 })).toBe(
      "Halo Rina, terima kasih sudah melakukan Facial Brightening di SunDY Clinic pada Sabtu, 17 Oktober 2026. Agar hasilnya maksimal, treatment ini sebaiknya dilakukan setiap minggu. Yuk jadwalkan kunjungan berikutnya — balas pesan ini untuk memilih waktu. SunDY Clinic",
    );
    expect(treatmentReminderMessage({ patientName: "Ani", treatments: ["Peeling", "Laser Toning"], treatmentOn: "2026-10-10", intervalDays: 14 })).toContain(
      "melakukan Peeling dan Laser Toning di SunDY Clinic pada Sabtu, 10 Oktober 2026. Agar hasilnya maksimal, treatment ini sebaiknya dilakukan setiap 2 minggu.",
    );
  });

  it("daftar nama treatment", () => {
    expect(treatmentNamesLabel(["A"])).toBe("A");
    expect(treatmentNamesLabel(["A", "B"])).toBe("A dan B");
    expect(treatmentNamesLabel(["A", "B", "C"])).toBe("A, B, dan C");
  });
});

describe("jarak pengingat treatment (spec pengingat treatment PT2, PT11)", () => {
  it("pilihan, label, dan frasa pesan", () => {
    expect(RETURN_INTERVALS).toEqual([7, 14, 21, 30, 60, 90, 180]);
    expect(RETURN_INTERVALS.map(returnIntervalLabel)).toEqual(["1 minggu", "2 minggu", "3 minggu", "1 bulan", "2 bulan", "3 bulan", "6 bulan"]);
    expect(returnIntervalLabel(null)).toBe("Tidak diingatkan");
    expect(RETURN_INTERVALS.map(returnIntervalPhrase)).toEqual([
      "setiap minggu",
      "setiap 2 minggu",
      "setiap 3 minggu",
      "setiap bulan",
      "setiap 2 bulan",
      "setiap 3 bulan",
      "setiap 6 bulan",
    ]);
  });

  it("hanya pilihan yang ada yang sah", () => {
    expect(isReturnInterval(14)).toBe(true);
    expect(isReturnInterval(10)).toBe(false);
    expect(isReturnInterval("7")).toBe(false);
    expect(isReturnInterval(null)).toBe(false);
  });
});
