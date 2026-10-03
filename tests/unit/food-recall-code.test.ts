// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  foodRecallCode,
  foodRecallKey,
  foodRecallUrl,
  isValidFoodRecallCode,
  parseFoodRecallCode,
} from "@/server/food-recall-code";
import { quizLinkCode, quizLinkKey } from "@/server/quiz-link-code";

const KEY = foodRecallKey("rahasia-uji");
const ID = "cmfoodrecall000000000001";

describe("kode link food recall", () => {
  it("bentuknya id + tanda tangan, dan berlaku untuk id itu", () => {
    const code = foodRecallCode(ID, KEY);
    expect(parseFoodRecallCode(code)).toEqual({ foodRecallId: ID, signature: expect.any(String) });
    expect(isValidFoodRecallCode(code, KEY)).toBe(true);
  });

  it("menolak id lain, tanda tangan diubah, dan kunci lain", () => {
    const code = foodRecallCode(ID, KEY);
    const other = foodRecallCode("cmfoodrecall000000000002", KEY);
    expect(isValidFoodRecallCode(`${ID}.${other.split(".")[1]}`, KEY)).toBe(false);
    expect(isValidFoodRecallCode(`${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`, KEY)).toBe(false);
    expect(isValidFoodRecallCode(code, foodRecallKey("rahasia-lain"))).toBe(false);
  });

  it("kode link kuis untuk id yang sama tidak berlaku sebagai kode food recall", () => {
    const quizCode = quizLinkCode(ID, 0, quizLinkKey("rahasia-uji"));
    expect(isValidFoodRecallCode(quizCode, KEY)).toBe(false);
  });

  it("menolak bentuk rusak", () => {
    expect(parseFoodRecallCode("")).toBeNull();
    expect(parseFoodRecallCode(42)).toBeNull();
    expect(parseFoodRecallCode("tanpa-titik")).toBeNull();
    expect(isValidFoodRecallCode("tanpa-titik", KEY)).toBe(false);
  });

  it("link memakai #, sehingga kode tidak terkirim ke server", () => {
    expect(foodRecallUrl("https://sundyclinic.com", ID, KEY)).toBe(`https://sundyclinic.com/food-recall#${foodRecallCode(ID, KEY)}`);
  });
});
