import Typography from "@mui/material/Typography";
import { AdminHeader } from "@/components/admin/admin-header";
import { ApprovalPinForm } from "@/components/admin/approval-pin-form";
import { PageBody, SectionCard } from "@/components/admin/page-layout";
import { hasOwnApprovalPin } from "@/server/approval-pin";

/** PIN persetujuan Admin Keuangan dan Super Admin (spec PIN P8). */
export default async function ApprovalPinPage() {
  const hasPin = await hasOwnApprovalPin();
  return (
    <>
      <AdminHeader title="PIN persetujuan" />
      <PageBody>
        <SectionCard title={hasPin ? "Ganti PIN" : "Buat PIN"}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            PIN 6 angka ini Anda ketik untuk menyetujui perubahan harga, diskon, pembatalan tagihan, dan pengembalian deposit.
            Jangan beri tahu siapa pun. Lupa PIN? Minta Super Admin mereset PIN Anda di menu Staf.
          </Typography>
          <ApprovalPinForm hasPin={hasPin} />
        </SectionCard>
      </PageBody>
    </>
  );
}
