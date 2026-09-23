import { AdminHeader } from "@/components/admin/admin-header";
import { ServicePriceForm } from "@/components/admin/service-price-form";
import { getServiceCategoriesWithServices } from "@/server/catalog";
import { requireCapability } from "@/server/session";

export default async function AdminServicesPage() {
  await requireCapability("content:manage");
  const categories = await getServiceCategoriesWithServices();

  return (
    <>
      <AdminHeader title="Layanan & Harga" />
      <div className="space-y-10 p-6">
        <p className="text-sm text-muted-foreground">
          Perubahan harga langsung tampil di situs publik. Setiap perubahan tercatat di jejak audit.
        </p>

        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="mb-3 text-lg font-medium">{category.name}</h2>
            <div className="space-y-2">
              {category.services.map((service) => (
                <ServicePriceForm
                  key={service.id}
                  service={{
                    id: service.id,
                    name: service.name,
                    normalPrice: service.normalPrice,
                    promoPrice: service.promoPrice,
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
