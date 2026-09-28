import { AdminHeader } from "@/components/admin/admin-header";
import { ClinicSettingForm } from "@/components/admin/clinic-setting-form";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";

export default async function ClinicSettingPage() {
  await requireCapability("content:manage");
  const setting = await getClinicSetting();

  return (
    <>
      <AdminHeader title="Pengaturan" />
      <div className="space-y-6 p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Biaya booking dan rekening tampil ke pasien setelah mereka mendaftar di situs. Biaya
          booking terpisah dari biaya layanan, tidak dikembalikan, dan tetap berlaku bila pasien
          pindah jadwal paling lambat 2 jam sebelum jadwal. Setiap perubahan tercatat di jejak audit.
        </p>
        <ClinicSettingForm setting={setting} />
      </div>
    </>
  );
}
