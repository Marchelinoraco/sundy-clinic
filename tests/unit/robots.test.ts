import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  it("menutup panel admin, link kuis, dan link food recall dari mesin pencari", () => {
    expect(robots().rules).toMatchObject({ disallow: ["/admin", "/isi", "/food-recall"] });
  });
});
