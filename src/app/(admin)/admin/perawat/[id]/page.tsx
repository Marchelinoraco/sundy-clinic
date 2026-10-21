import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AdminHeader } from "@/components/admin/admin-header";
import { TextLink } from "@/components/admin/mui/links";
import { NurseVisitView } from "@/components/admin/nurse/nurse-visit";
import { PageBody } from "@/components/admin/page-layout";
import { NURSE_OUT_OF_SCOPE } from "@/lib/nurse";
import { getNurseVisit } from "@/server/nurse";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Tangani pasien" };

/** Halaman Tangani perawat (spec peran perawat 7): food recall dan BIA pasien yang sudah check-in hari ini. */
export default async function NurseVisitPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("nurse:work");
  const { id } = await params;
  const visit = await getNurseVisit(id);
  return (
    <>
      <AdminHeader title="Tangani pasien" />
      <PageBody>
        {visit ? (
          <NurseVisitView visit={visit} />
        ) : (
          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
            <Typography>{NURSE_OUT_OF_SCOPE}</Typography>
            <TextLink href="/admin" underline="always">
              Kembali ke Dasbor
            </TextLink>
          </Stack>
        )}
      </PageBody>
    </>
  );
}
