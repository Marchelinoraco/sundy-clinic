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
import { ExtendPackageDialog } from "@/components/admin/package/extend-package-dialog";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { PACKAGE_ENTRY_LABEL, PACKAGE_STATE_LABEL } from "@/lib/treatment-package";
import { getPatientPackage } from "@/server/patient-package-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Paket customer" };

export default async function PatientPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const pkg = await getPatientPackage((await params).id);
  if (!pkg) notFound();
  const canExtend = can(staff.role, "invoice:correct") && pkg.state !== "DIBATALKAN";

  return (
    <>
      <AdminHeader title="Paket" />
      <PageBody>
        <PageHeader
          title={pkg.name}
          trail={[{ label: "Paket", href: "/admin/paket" }, { label: pkg.patient.name }]}
          description={`${pkg.patient.name} · ${pkg.patient.medicalRecordNumber} · dibeli ${dateLabel(pkg.startsOn)} (${pkg.purchaseInvoice.number ?? "draf"}) · ${formatRupiah(pkg.price)} · berlaku s.d. ${dateLabel(pkg.expiresOn)}`}
          actions={
            <>
              <StatusChip label={PACKAGE_STATE_LABEL[pkg.state]} />
              {canExtend && <ExtendPackageDialog packageId={pkg.id} expiresOn={pkg.expiresOn} />}
            </>
          }
        />
        <SectionCard title="Sisa sesi" flush>
          <TableContainer>
            <Table size="small" aria-label="Sisa sesi">
              <TableHead>
                <TableRow>
                  <TableCell>Treatment</TableCell>
                  <TableCell align="right">Sisa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pkg.items.map((item) => (
                  <TableRow key={item.serviceName}>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell align="right">
                      {item.remaining} dari {item.sessions}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
                    <TableCell>Treatment</TableCell>
                    <TableCell align="right">Sesi</TableCell>
                    <TableCell>Keterangan</TableCell>
                    <TableCell>Staf</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pkg.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateWithYear(entry.createdAt)}</TableCell>
                      <TableCell>{PACKAGE_ENTRY_LABEL[entry.kind]}</TableCell>
                      <TableCell>{entry.serviceName ?? "—"}</TableCell>
                      <TableCell align="right">{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</TableCell>
                      <TableCell>
                        {entry.invoice && <TextLink href={`/admin/tagihan/${entry.invoice.id}`}>{entry.invoice.number ?? "Draf"}</TextLink>}
                        {entry.kind === "PERPANJANG" && `${dateLabel(entry.previousExpiresOn)} → ${dateLabel(entry.newExpiresOn)} · ${entry.reason}`}
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
