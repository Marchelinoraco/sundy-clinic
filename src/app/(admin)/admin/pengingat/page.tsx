import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { ReminderWorklistView } from "@/components/admin/reminder-worklist";
import { getReminderWorklist } from "@/server/reminder";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Pengingat" };

export default async function ReminderPage() {
  await requireCapability("booking:manage");
  const worklist = await getReminderWorklist();

  return (
    <>
      <AdminHeader title="Pengingat" />
      <PageBody>
        <PageHeader title="Pengingat" description="Konfirmasi dan pengingat H-1 lewat WhatsApp." />
        <ReminderWorklistView worklist={worklist} />
      </PageBody>
    </>
  );
}
