"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { IMPORTANT_NOTES_MAX, PAPER_RECORD_NUMBER_MAX } from "@/lib/encounter";
import { updatePaperRecordNumber, updatePatientImportantNotes } from "@/server/patient";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function InlineTextEditor(props: {
  label: string;
  editLabel: string;
  value: string | null;
  emptyText: string;
  multiline: boolean;
  maxLength: number;
  onSave: (text: string) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.value ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await props.onSave(text);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${props.label} disimpan.`);
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <h3 className="text-xs text-muted-foreground">{props.label}</h3>
        <p className="whitespace-pre-line">{props.value ?? props.emptyText}</p>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => {
            setText(props.value ?? "");
            setEditing(true);
          }}
        >
          {props.editLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {props.label}
      </Label>
      {props.multiline ? (
        <textarea
          id={id}
          rows={3}
          maxLength={props.maxLength}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={textareaClass}
        />
      ) : (
        <Input id={id} maxLength={props.maxLength} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          Simpan
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}

/** Catatan penting dokter (spec R6). Hanya ditampilkan untuk record:write. */
export function ImportantNotesForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="Catatan penting"
      editLabel="Ubah catatan penting"
      value={value}
      emptyText="Belum ada"
      multiline
      maxLength={IMPORTANT_NOTES_MAX}
      onSave={(text) => updatePatientImportantNotes({ patientId, text })}
    />
  );
}

/** No. RM kertas lama (spec R11), untuk semua staf booking:manage. */
export function PaperRecordNumberForm({ patientId, value }: { patientId: string; value: string | null }) {
  return (
    <InlineTextEditor
      label="No. RM kertas lama"
      editLabel="Ubah no. RM kertas lama"
      value={value}
      emptyText="—"
      multiline={false}
      maxLength={PAPER_RECORD_NUMBER_MAX}
      onSave={(text) => updatePaperRecordNumber({ patientId, text })}
    />
  );
}
