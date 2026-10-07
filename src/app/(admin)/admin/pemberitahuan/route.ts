import { liveEventsFor } from "@/server/live-events";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Pemeriksaan berkala pemberitahuan langsung (spec pemberitahuan): peristiwa sejak `sejak` untuk peran yang bertanya. */
export async function GET(request: Request): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return Response.json({ error: "Masuk dulu." }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("sejak");
  const since = new Date(raw ?? "");
  if (!raw || Number.isNaN(since.getTime())) return Response.json({ error: "Parameter sejak tidak sah." }, { status: 400 });

  return Response.json(await liveEventsFor(staff.role, since), { headers: { "Cache-Control": "no-store" } });
}
