import { AdminHeader } from "@/components/admin/admin-header";
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
      <div className="p-6">
        <ReminderWorklistView worklist={worklist} />
      </div>
    </>
  );
}
