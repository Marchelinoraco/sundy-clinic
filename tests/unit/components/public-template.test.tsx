import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicTemplate from "@/app/(public)/template";

describe("transisi halaman publik", () => {
  it("membungkus isi halaman dengan animasi masuk", () => {
    render(
      <PublicTemplate>
        <p>Isi halaman</p>
      </PublicTemplate>,
    );
    expect(screen.getByText("Isi halaman").parentElement).toHaveClass("page-in");
  });
});
