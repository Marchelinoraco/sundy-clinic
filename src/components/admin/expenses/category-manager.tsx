"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_NAME_MAX } from "@/lib/expense";
import { createExpenseCategory, setExpenseCategoryActive } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";

/** Tambah dan nonaktifkan kategori pengeluaran (spec laporan 7). Kategori tidak dihapus. */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="Nama kategori baru" className="max-w-xs" maxLength={CATEGORY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori baru" />
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => createExpenseCategory({ name }), () => setName(""))}>
          Tambah kategori
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="divide-y rounded-md border text-sm">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className={category.isActive ? undefined : "text-muted-foreground"}>
              {category.name} {!category.isActive && <Badge variant="outline">Nonaktif</Badge>}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`${category.isActive ? "Nonaktifkan" : "Aktifkan"} ${category.name}`}
              onClick={() => run(() => setExpenseCategoryActive({ id: category.id, active: !category.isActive }))}
            >
              {category.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
