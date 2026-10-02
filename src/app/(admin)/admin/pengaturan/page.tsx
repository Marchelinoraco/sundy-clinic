import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { PageBody } from "@/components/admin/page-layout";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";

export default async function ClinicSettingPage() {
  await requireCapability("content:manage");
  const setting = await getClinicSetting();

  return (
    <>
      <AdminHeader title="Pengaturan" />
      <PageBody>
        <ClinicSettingForm setting={setting} />
      </PageBody>
    </>
  );
}
