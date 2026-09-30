"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ENCOUNTER_TEXT_MAX } from "@/lib/encounter";
import { addEncounterAddendum } from "@/server/encounter";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Tambah adendum pada catatan final (PRD F12). */
export function AddendumForm({ encounterId }: { encounterId: string }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const result = await addEncounterAddendum({ encounterId, text });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setText("");
        toast.success("Adendum ditambahkan.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan adendum. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Tambah adendum</h3>
      <Label htmlFor={id}>Isi adendum</Label>
      <textarea
        id={id}
        rows={3}
        maxLength={ENCOUNTER_TEXT_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={textareaClass}
      />
      <Button onClick={submit} disabled={pending || text.trim() === ""}>
        Simpan adendum
      </Button>
    </div>
  );
}
