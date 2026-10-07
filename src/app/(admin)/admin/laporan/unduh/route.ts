import { can } from "@/lib/permissions";
import { exportReportCsv } from "@/server/report-export";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Unduh CSV laporan. Pemeriksaan hak akses dilakukan di sini dan lagi di `exportReportCsv`. */
export async function GET(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "profit:read")) return new Response("Anda tidak berhak mengunduh laporan.", { status: 403 });

  const params = new URL(request.url).searchParams;
  try {
    const { filename, csv } = await exportReportCsv({
      period: { from: params.get("dari") ?? "", to: params.get("sampai") ?? "" },
      branchId: params.get("cabang") || null,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Gagal membuat laporan.", { status: 400 });
  }
}
