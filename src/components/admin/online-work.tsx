"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OnlineWorkRow } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";
import { EmptyState, SectionCard } from "./page-layout";

const PHASES = [
  { phase: "NOW", title: "Sekarang" },
  { phase: "TODAY", title: "Hari ini" },
  { phase: "UPCOMING", title: "Mendatang" },
] as const;

function WorkItem({ row, showDoctor }: { row: OnlineWorkRow; showDoctor: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      try {
        const result = await startOnlineConsultation(row.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.push(`/admin/kunjungan/${result.data.encounterId}`);
      } catch {
        toast.error("Gagal memulai konsultasi. Coba lagi.");
      }
    });
  }

  function notReached() {
    startTransition(async () => {
      try {
        const result = await recordContactAttempt(row.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`Percobaan menghubungi ${row.patientName} dicatat.`);
        router.refresh();
      } catch {
        toast.error("Gagal mencatat. Coba lagi.");
      }
    });
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{row.patientName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {row.patientRecordNumber} · {row.code}
        </span>
        {row.purposeLabel && <Badge variant="outline">{row.purposeLabel}</Badge>}
        {showDoctor && <span className="text-xs text-muted-foreground">{row.doctorName}</span>}
      </div>
      <ul className="space-y-0.5 text-sm">
        {row.windows.map((window) => (
          <li key={window.label} className={window.current ? "font-medium text-emerald-700" : undefined}>
            • {window.label}
            {window.current && <span className="ml-2 text-xs">sedang berlangsung</span>}
          </li>
        ))}
      </ul>
      {row.lastAttempt && <p className="text-xs text-muted-foreground">{row.lastAttempt}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={start} disabled={pending}>
          Mulai konsultasi
        </Button>
        <Button size="sm" variant="outline" onClick={notReached} disabled={pending}>
          Tidak terhubung
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={row.whatsappLink} target="_blank" rel="noopener noreferrer">
            WhatsApp {row.whatsapp}
          </a>
        </Button>
        {row.intakeId && (
          <Link href={`/admin/isian/${row.intakeId}`} className="text-sm underline underline-offset-4">
            Lihat isian
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Bagian "Konsultasi online" di dasbor dokter (spec konsultasi online 6.1): booking terkonfirmasi
 * yang masih punya rentang terbuka, dikelompokkan Sekarang / Hari ini / Mendatang. Dokter menelepon
 * lewat WhatsApp, lalu menekan Mulai konsultasi (boleh di luar rentang) atau Tidak terhubung.
 */
export function OnlineWorkView({ rows }: { rows: OnlineWorkRow[] }) {
  const showDoctor = new Set(rows.map((row) => row.doctorName)).size > 1;
  return (
    <SectionCard title="Konsultasi online">
      {rows.length === 0 ? (
        <EmptyState>Tidak ada konsultasi online yang menunggu.</EmptyState>
      ) : (
        <div className="space-y-4">
          {PHASES.map(({ phase, title }) => {
            const group = rows.filter((row) => row.phase === phase);
            if (group.length === 0) return null;
            return (
              <section key={phase} className="space-y-1">
                <h3 className="text-sm font-semibold text-brown-900">{title}</h3>
                <ul className="divide-y">
                  {group.map((row) => (
                    <WorkItem key={row.appointmentId} row={row} showDoctor={showDoctor} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
