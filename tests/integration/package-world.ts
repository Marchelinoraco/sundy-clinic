import { prisma } from "@/lib/db";
import type { BillingWorld } from "./invoice-world";

/** Paket katalog langsung di basis data (tanpa aksi server); nama selalu diawali slug dunia uji agar ikut dibersihkan. */
export async function catalogPackage(
  world: BillingWorld,
  input: { name: string; price?: number; validDays?: number; items?: { serviceId: string; sessions: number }[]; isActive?: boolean },
): Promise<string> {
  const items = input.items ?? [{ serviceId: world.treatmentId, sessions: 3 }];
  const created = await prisma.treatmentPackage.create({
    data: {
      name: `${world.slug} ${input.name}`,
      price: input.price ?? 600_000,
      validDays: input.validDays ?? 90,
      isActive: input.isActive ?? true,
      items: { create: items.map((item, index) => ({ ...item, sortOrder: index })) },
    },
    select: { id: true },
  });
  return created.id;
}
