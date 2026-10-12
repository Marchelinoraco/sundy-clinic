import { readQzCertificate } from "@/server/qz-signing";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Sertifikat publik untuk qz.security.setCertificatePromise; hanya untuk staf yang login. */
export async function GET(): Promise<Response> {
  if (!(await getCurrentStaff())) return new Response("Masuk dulu.", { status: 401 });
  const certificate = await readQzCertificate();
  if (!certificate) return new Response("Sertifikat QZ belum diatur.", { status: 404 });
  return new Response(certificate, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
