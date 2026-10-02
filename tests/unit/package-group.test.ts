import { describe, expect, it } from "vitest";
import { PACKAGE_GROUPS, parsePackageGroup } from "@/lib/package-group";

describe("parsePackageGroup", () => {
  it("mengurutkan kelompok paket MAX, LUX, ACTIVE", () => {
    expect(PACKAGE_GROUPS).toEqual(["MAX", "LUX", "ACTIVE"]);
  });

  it("membaca ?paket= tanpa peduli huruf besar-kecil dan spasi", () => {
    expect(parsePackageGroup("lux")).toBe("LUX");
    expect(parsePackageGroup(" LuX ")).toBe("LUX");
    expect(parsePackageGroup("active")).toBe("ACTIVE");
    expect(parsePackageGroup("MAX")).toBe("MAX");
  });

  it("kembali ke MAX untuk nilai kosong atau tidak dikenal", () => {
    expect(parsePackageGroup(undefined)).toBe("MAX");
    expect(parsePackageGroup("")).toBe("MAX");
    expect(parsePackageGroup("premium")).toBe("MAX");
    expect(parsePackageGroup("constructor")).toBe("MAX");
  });

  it("memakai nilai pertama bila ?paket= diulang", () => {
    expect(parsePackageGroup(["lux", "max"])).toBe("LUX");
    expect(parsePackageGroup([])).toBe("MAX");
  });
});
