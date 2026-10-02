import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Bar atas setiap halaman admin. Judul besar halaman ada di PageHeader (spec D 3.2), jadi
 * judul di sini bukan <h1> — kecuali halaman tanpa PageHeader (Kunjungan) yang memintanya.
 */
export function AdminHeader({ title, heading = false }: { title: string; heading?: boolean }) {
  const Title = heading ? "h1" : "span";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Title className="text-sm font-medium">{title}</Title>
    </header>
  );
}
