import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicBankAccounts } from "@/components/admin/clinic-bank-accounts";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { PageBody } from "@/components/admin/page-layout";
import { listClinicBankAccounts } from "@/server/clinic-bank";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";

export default async function ClinicSettingPage() {
  await requireCapability("content:manage");
  const [setting, accounts] = await Promise.all([getClinicSetting(), listClinicBankAccounts()]);

  return (
    <>
      <AdminHeader title="Pengaturan" />
      <PageBody>
        <ClinicSettingForm setting={setting} />
        <ClinicBankAccounts accounts={accounts} />
      </PageBody>
    </>
  );
}
