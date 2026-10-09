import { contentDisposition } from "@/lib/bia";
import { can } from "@/lib/permissions";
import { recordAuditThrottled } from "@/server/audit";
import { findBiaFileForViewer } from "@/server/bia-read";
import { readBiaFile } from "@/server/bia-storage";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Membuka satu berkas hasil BIA. Tidak ada alamat publik: login dan hak rekam medis diperiksa di sini (spec hasil BIA 4.3). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "record:read")) return new Response("Anda tidak berhak membuka hasil BIA.", { status: 403 });

  const { id } = await params;
  const file = await findBiaFileForViewer(id);
  if (!file) return new Response("Berkas tidak ditemukan.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readBiaFile(file.storageName);
  } catch (error) {
    console.error("Berkas BIA hilang dari penyimpanan", id, error);
    return new Response("Berkas tidak ditemukan di penyimpanan.", { status: 404 });
  }

  await recordAuditThrottled({
    actor: staff,
    action: "bia.view",
    entity: "BiaMeasurement",
    entityId: file.measurementId,
    summary: `${file.appointmentCode} · ${file.originalName}`,
  });
  const forceDownload = new URL(request.url).searchParams.get("unduh") === "1" || file.mimeType === "image/heic";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition(file.originalName, forceDownload ? "attachment" : "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
