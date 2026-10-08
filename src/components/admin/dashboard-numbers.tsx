import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { deltaLabel } from "@/lib/dashboard";
import { formatRupiah } from "@/lib/format";
import type { DashboardNumbers } from "@/server/dashboard";
import { BookingSourceChart } from "./booking-source-chart";
import { TextLink } from "./mui/links";
import { SectionCard } from "./page-layout";

/** Selisih rupiah tanpa "Rp": "+250.000", "−200.000", atau "sama". */
function feeDelta(current: number, previous: number): string {
  const label = deltaLabel(current, previous);
  if (label === "sama") return label;
  return `${label[0]}${formatRupiah(Math.abs(current - previous)).replace(/^Rp\s?/, "")}`;
}

function Figure({ label, value, delta, compare }: { label: string; value: ReactNode; delta: string; compare: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "1.875rem", fontWeight: 600, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
        {delta} dibanding {compare}
      </Typography>
    </Stack>
  );
}

/** Kartu Angka untuk Super Admin (spec D 4.5). */
export function DashboardNumbersCard({ numbers }: { numbers: DashboardNumbers }) {
  const { current, previous, previousLabel } = numbers;
  const periods = [
    { id: "minggu", label: "Minggu ini", href: "/admin" },
    { id: "bulan", label: "Bulan ini", href: "/admin?periode=bulan" },
  ] as const;
  return (
    <SectionCard
      title="Angka"
      description={numbers.label}
      actions={
        <Box component="nav" aria-label="Periode angka" sx={{ display: "flex", gap: 0.5, border: 1, borderColor: "divider", borderRadius: 2, p: 0.25 }}>
          {periods.map((p) => (
            <TextLink
              key={p.id}
              href={p.href}
              aria-current={numbers.period === p.id ? "page" : undefined}
              sx={{
                px: 1,
                py: 0.5,
                borderRadius: 1.5,
                fontSize: "0.75rem",
                ...(numbers.period === p.id ? { bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 600 } : { color: "text.secondary" }),
              }}
            >
              {p.label}
            </TextLink>
          ))}
        </Box>
      }
    >
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
        <Figure label="Booking" value={current.bookings} delta={deltaLabel(current.bookings, previous.bookings)} compare={previousLabel} />
        <Figure label="Pasien baru" value={current.newPatients} delta={deltaLabel(current.newPatients, previous.newPatients)} compare={previousLabel} />
        <Figure
          label="Biaya booking masuk"
          value={formatRupiah(current.feeReceived)}
          delta={feeDelta(current.feeReceived, previous.feeReceived)}
          compare={previousLabel}
        />
      </Box>
      <BookingSourceChart bySource={current.bySource} />
      <Box component="dl" sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.5, fontSize: "0.875rem", m: 0 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1 }}>
          <Box component="dt" sx={{ color: "text.secondary" }}>
            Per sumber:
          </Box>
          <Box component="dd" sx={{ m: 0 }}>
            Situs {current.bySource.SITUS} · WhatsApp {current.bySource.WHATSAPP} · Telepon {current.bySource.TELEPON} · Walk-in{" "}
            {current.bySource.WALK_IN}
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1 }}>
          <Box component="dt" sx={{ color: "text.secondary" }}>
            Tidak hadir &amp; batal:
          </Box>
          <Box component="dd" sx={{ m: 0 }}>
            Tidak hadir {current.noShow} · Dibatalkan {current.cancelled} · Kedaluwarsa {current.expired}
          </Box>
        </Box>
      </Box>
    </SectionCard>
  );
}
