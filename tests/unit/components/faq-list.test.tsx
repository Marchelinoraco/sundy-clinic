import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FaqList, filterFaqs } from "@/components/public/faq-list";

const FAQS = [
  { question: "Apa itu Timbang BIA?", answer: "BIA mengukur komposisi tubuh Anda." },
  { question: "Berapa jam operasional klinik?", answer: "Senin–Sabtu, 11.00–19.00 WITA." },
  { question: "Kapan cabang Citraland buka?", answer: "Cabang Citraland sedang dipersiapkan." },
];

describe("filterFaqs", () => {
  it("mencari di pertanyaan dan jawaban tanpa peduli huruf besar-kecil dan spasi", () => {
    expect(filterFaqs(FAQS, "bia").map((faq) => faq.question)).toEqual(["Apa itu Timbang BIA?"]);
    expect(filterFaqs(FAQS, "  SENIN  ").map((faq) => faq.question)).toEqual(["Berapa jam operasional klinik?"]);
    expect(filterFaqs(FAQS, "cabang dipersiapkan").map((faq) => faq.question)).toEqual([
      "Kapan cabang Citraland buka?",
    ]);
  });

  it("menampilkan semua pertanyaan bila kotak cari kosong", () => {
    expect(filterFaqs(FAQS, "   ")).toHaveLength(3);
  });
});

describe("FaqList", () => {
  it("membuka dan menutup jawaban", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    const button = screen.getByRole("button", { name: "Apa itu Timbang BIA?" });
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "") as HTMLElement;

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("inert");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByRole("region", { name: "Apa itu Timbang BIA?" })).toHaveTextContent(
      "BIA mengukur komposisi tubuh Anda.",
    );

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("menyimpan semua jawaban di HTML walau tertutup, supaya tetap terbaca mesin pencari", () => {
    render(<FaqList faqs={FAQS} />);
    for (const faq of FAQS) expect(screen.getByText(faq.answer)).toBeInTheDocument();
  });

  it("menyaring pertanyaan saat mengetik", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    await user.type(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), "bia");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Apa itu Timbang BIA?"]);
  });

  it("memberi tahu bila tidak ada pertanyaan yang cocok", async () => {
    const user = userEvent.setup();
    render(<FaqList faqs={FAQS} />);
    await user.type(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Tidak ada pertanyaan yang cocok.");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
