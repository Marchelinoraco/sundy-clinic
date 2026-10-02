import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  it("menutup panel admin dan halaman link kuis dari mesin pencari", () => {
    expect(robots().rules).toMatchObject({ disallow: ["/admin", "/isi"] });
  });
});
