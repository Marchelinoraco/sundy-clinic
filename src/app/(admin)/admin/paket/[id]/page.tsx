import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { TextLink } from "@/components/admin/mui/links";
import { StatusChip } from "@/components/admin/mui/status-chip";
import { CancelLegacyDialog } from "@/components/admin/package/cancel-legacy-dialog";
import { ChangeVisitDialog } from "@/components/admin/package/change-visit-dialog";
import { CorrectLegacyDialog } from "@/components/admin/package/correct-legacy-dialog";
import { ExtendPackageDialog } from "@/components/admin/package/extend-package-dialog";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { visitContentsLabel } from "@/lib/package-visit";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { isNoExpiry, PACKAGE_ENTRY_LABEL, PACKAGE_STATE_LABEL } from "@/lib/treatment-package";
import { getPatientPackage } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Paket customer" };

export default async function PatientPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const pkg = await getPatientPackage((await params).id);
  if (!pkg) notFound();
  const legacy = pkg.source === "KLUTO";
  // Paket lama tanpa batas waktu tidak diperpanjang; ia dikoreksi atau dibatalkan (spec paket lama PL6, PL11).
  const canExtend = can(staff.role, "invoice:correct") && pkg.state !== "DIBATALKAN" && !legacy;
  const canFixLegacy = can(staff.role, "invoice:correct") && pkg.state !== "DIBATALKAN" && legacy;
  // Resepsionis dan Admin Keuangan boleh menggeser kunjungan berikutnya (spec jadwal paket JP9, 4.6); rencana kosong paket lama boleh diisi (PL13).
  const canChangeVisit = (can(staff.role, "invoice:manage") || can(staff.role, "invoice:correct")) && pkg.state === "AKTIF";
  const description = legacy
    ? `${pkg.patient.name} · ${pkg.patient.medicalRecordNumber} · dibeli di Kluto ${dateLabel(pkg.startsOn)} · Dibayar di Kluto · Tanpa batas waktu`
    : `${pkg.patient.name} · ${pkg.patient.medicalRecordNumber} · dibeli ${dateLabel(pkg.startsOn)} (${pkg.purchaseInvoice?.number ?? "draf"}) · ${formatRupiah(pkg.price)} · berlaku s.d. ${dateLabel(pkg.expiresOn)}`;

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader
          title={legacy ? `${pkg.name} · Paket lama (Kluto)` : pkg.name}
          trail={[{ label: "Paket", href: "/admin/paket" }, { label: pkg.patient.name }]}
          description={description}
          actions={
            <>
              <StatusChip label={PACKAGE_STATE_LABEL[pkg.state]} />
              {canExtend && <ExtendPackageDialog packageId={pkg.id} expiresOn={pkg.expiresOn} />}
              {canFixLegacy && <CorrectLegacyDialog packageId={pkg.id} items={pkg.items.map((item) => ({ ...item, name: item.serviceName }))} />}
              {canFixLegacy && <CancelLegacyDialog packageId={pkg.id} />}
            </>
          }
        />
        {legacy && pkg.note && (
          <SectionCard title="Catatan">
            <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
              {pkg.note}
            </Box>
          </SectionCard>
        )}
        <SectionCard title="Sisa paket" flush>
          <TableContainer>
            <Table size="small" aria-label="Sisa paket">
              <TableHead>
                <TableRow>
                  <TableCell>Isi</TableCell>
                  <TableCell align="right">Sisa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pkg.items.map((item) => (
                  <TableRow key={item.serviceName}>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell align="right">
                      {item.remaining} dari {item.sessions}
                      {item.unit && ` ${item.unit}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
        <SectionCard
          title="Rencana kunjungan"
          description="Tiap kunjungan: 1 sesi tiap treatment yang bersisa dan jatah barang per kunjungan."
          actions={canChangeVisit && <ChangeVisitDialog packageId={pkg.id} nextVisitOn={pkg.nextVisitOn} today={witaDateString(new Date())} expiresOn={pkg.expiresOn} />}
          flush
        >
          {pkg.doneVisits.length + pkg.plan.length === 0 ? (
            <EmptyState>Tidak ada rencana kunjungan.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Rencana kunjungan">
                <TableHead>
                  <TableRow>
                    <TableCell>Kunjungan</TableCell>
                    <TableCell>Tanggal</TableCell>
                    <TableCell>Isi</TableCell>
                    <TableCell>Keterangan</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pkg.doneVisits.map((visit) => (
                    <TableRow key={`selesai-${visit.number}`}>
                      <TableCell>Ke-{visit.number}</TableCell>
                      <TableCell>{dateLabel(visit.date)}</TableCell>
                      <TableCell>{visitContentsLabel(visit.contents)}</TableCell>
                      <TableCell>
                        Selesai · <TextLink href={`/admin/tagihan/${visit.invoice.id}`}>{visit.invoice.number ?? "Tagihan"}</TextLink>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pkg.plan.map((visit, index) => (
                    <TableRow key={`rencana-${visit.number}`}>
                      <TableCell>Ke-{visit.number}</TableCell>
                      <TableCell>{dateLabel(visit.date)}</TableCell>
                      <TableCell>{visitContentsLabel(visit.contents)}</TableCell>
                      <TableCell>
                        {index === 0 ? "Berikutnya" : "Rencana"}
                        {!isNoExpiry(pkg.expiresOn) && visit.date > pkg.expiresOn && " · melewati masa berlaku"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
        <SectionCard title="Riwayat" description="Terbaru di atas." flush>
          {pkg.entries.length === 0 ? (
            <EmptyState>Belum ada riwayat.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Riwayat paket">
                <TableHead>
                  <TableRow>
                    <TableCell>Tanggal</TableCell>
                    <TableCell>Jenis</TableCell>
                    <TableCell>Isi</TableCell>
                    <TableCell align="right">Jumlah</TableCell>
                    <TableCell>Keterangan</TableCell>
                    <TableCell>Staf</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pkg.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateWithYear(entry.createdAt)}</TableCell>
                      <TableCell>{legacy && entry.kind === "BELI" ? "Beli (Kluto)" : PACKAGE_ENTRY_LABEL[entry.kind]}</TableCell>
                      <TableCell>{entry.serviceName ?? "—"}</TableCell>
                      <TableCell align="right">{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</TableCell>
                      <TableCell>
                        {entry.invoice && <TextLink href={`/admin/tagihan/${entry.invoice.id}`}>{entry.invoice.number ?? "Draf"}</TextLink>}
                        {entry.kind === "PERPANJANG" && `${dateLabel(entry.previousExpiresOn)} → ${dateLabel(entry.newExpiresOn)} · ${entry.reason}`}
                        {(entry.kind === "BATAL_PAKET" || entry.kind === "KOREKSI_KLUTO") && entry.reason}
                      </TableCell>
                      <TableCell>{entry.staffName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
