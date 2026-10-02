import Link from "next/link";
import { cn } from "@/lib/utils";

export type PageTab = { id: string; label: string; href: string };

/** Tab sebagai tautan (`?tab=`), bukan tab ARIA: setiap tab adalah alamat sendiri (spec D 3.1). */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b">
      <ul className="flex gap-6">
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 py-2 text-sm",
                  current ? "border-gold-500 font-semibold text-brown-900" : "border-transparent text-muted-foreground hover:text-brown-900",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
