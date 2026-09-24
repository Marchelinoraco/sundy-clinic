import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SignInForm } from "@/components/admin/sign-in-form";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { getCurrentStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Masuk",
  // Halaman login tidak boleh terindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  if (await getCurrentStaff()) redirect("/admin");

  return (
    <div className="flex min-h-svh items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl text-brown-900">Panel Admin</h1>
        <p className="mt-1 mb-6 text-sm text-brown-600">{CLINIC_FULL_NAME}</p>
        <SignInForm />
      </div>
    </div>
  );
}
