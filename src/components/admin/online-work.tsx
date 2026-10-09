"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { OnlineWorkRow } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";
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
    <Box component="li" sx={{ display: "flex", flexDirection: "column", gap: 1, py: 1.5 }}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.5 }}>
        <Box component="span" sx={{ fontWeight: 500 }}>
          {row.patientName}
        </Box>
        <Box component="span" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" }}>
          {row.patientRecordNumber} · {row.code}
        </Box>
        {row.purposeLabel && <StatusChip label={row.purposeLabel} />}
        {showDoctor && (
          <Box component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {row.doctorName}
          </Box>
        )}
      </Stack>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: 0.25 }}>
        {row.windows.map((window) => (
          <Box component="li" key={window.label} sx={window.current ? { fontWeight: 500, color: "success.main" } : undefined}>
            • {window.label}
            {window.current && (
              <Box component="span" sx={{ ml: 1, fontSize: "0.75rem" }}>
                sedang berlangsung
              </Box>
            )}
          </Box>
        ))}
      </Box>
      {row.lastAttempt && (
        <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
          {row.lastAttempt}
        </Typography>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Button size="small" variant="contained" onClick={start} disabled={pending}>
          Mulai konsultasi
        </Button>
        <Button size="small" variant="outlined" onClick={notReached} disabled={pending}>
          Tidak terhubung
        </Button>
        <Button size="small" variant="outlined" component="a" href={row.whatsappLink} target="_blank" rel="noopener noreferrer">
          WhatsApp {row.whatsapp}
        </Button>
        {row.intakeId && (
          <TextLink href={`/admin/isian/${row.intakeId}`} underline="always" sx={{ fontSize: "0.875rem" }}>
            Lihat isian
          </TextLink>
        )}
      </Stack>
    </Box>
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
        <Stack spacing={2}>
          {PHASES.map(({ phase, title }) => {
            const group = rows.filter((row) => row.phase === phase);
            if (group.length === 0) return null;
            return (
              <Box component="section" key={phase}>
                <Typography component="h3" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  {title}
                </Typography>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
                  {group.map((row) => (
                    <WorkItem key={row.appointmentId} row={row} showDoctor={showDoctor} />
                  ))}
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}
