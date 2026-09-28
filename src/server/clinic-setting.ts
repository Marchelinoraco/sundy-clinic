"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import type { BankAccount } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type ClinicSettingView = BankAccount & { bookingFee: number };

const SETTING_SELECT = {
  bookingFee: true,
  bankName: true,
  bankAccountNumber: true,
  bankAccountHolder: true,
} as const;

const MAX_BOOKING_FEE = 10_000_000;

/** Tidak rahasia: biaya dan rekening memang ditampilkan ke pasien setelah booking. */
export async function getClinicSetting(): Promise<ClinicSettingView> {
  return prisma.clinicSetting.findUniqueOrThrow({ where: { id: 1 }, select: SETTING_SELECT });
}

function optionalText(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 100) {
    throw new UserFacingError(`${label} terlalu panjang (maksimal 100 karakter).`);
  }
  return trimmed || null;
}

export async function updateClinicSetting(input: {
  bookingFee: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}): Promise<ActionResult<ClinicSettingView>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");

    if (
      !Number.isInteger(input.bookingFee) ||
      input.bookingFee < 0 ||
      input.bookingFee > MAX_BOOKING_FEE
    ) {
      throw new UserFacingError(
        "Biaya booking harus berupa angka rupiah bulat antara 0 dan 10.000.000.",
      );
    }

    const data = {
      bookingFee: input.bookingFee,
      bankName: optionalText(input.bankName, "Nama bank"),
      bankAccountNumber: optionalText(input.bankAccountNumber, "Nomor rekening"),
      bankAccountHolder: optionalText(input.bankAccountHolder, "Nama pemilik rekening"),
    };

    const updated = await prisma.clinicSetting.update({
      where: { id: 1 },
      data,
      select: SETTING_SELECT,
    });

    await recordAudit({
      actor,
      action: "clinic-setting.update",
      entity: "ClinicSetting",
      entityId: "1",
      summary: `biaya booking ${data.bookingFee}; rekening ${data.bankName ?? "-"} ${data.bankAccountNumber ?? "-"}`,
    });

    safeRevalidatePath("/admin/pengaturan");
    return updated;
  });
}
