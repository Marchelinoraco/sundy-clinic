import type { Metadata } from "next";
import { FoodRecallEntry } from "@/components/food-recall/food-recall-entry";

export const metadata: Metadata = {
  title: "Catatan Makan Kemarin",
  robots: { index: false, follow: false },
};

/** Halaman statis: kode ada di bagian "#" dan hanya dibaca browser (spec check-in 4.2). */
export default function FoodRecallPage() {
  return <FoodRecallEntry />;
}
