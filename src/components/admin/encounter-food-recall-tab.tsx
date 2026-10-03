"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActivityList } from "@/components/kuis/activity-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { foodRecallHeader, foodRecallSubjectiveText, type FoodRecallAuthor, type FoodRecallView } from "@/lib/food-recall";
import { formatShortIndonesianDate } from "@/lib/format";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { FoodRecallDialog } from "./food-recall-dialog";
import { FoodRecallTable } from "./food-recall-table";

/** Jalan ke kolom S formulir kunjungan (spec check-in 5.2). Tidak ada saat catatan final atau hanya-baca. */
export type SubjectiveCopy = { has: (text: string) => boolean; append: (block: string) => boolean };

/** Baris di penyunting: baris lama membawa penandanya, tambahan dokter belum (server menandainya DOKTER). */
type EditableEntry = ActivityEntry & { by?: FoodRecallAuthor };

const at = (date: Date) => `${formatShortIndonesianDate(date)} ${minutesToTimeLabel(witaMinutesOfDay(date))}`;

/** Tab "Food recall" halaman kunjungan (spec check-in bagian 5). */
export function EncounterFoodRecallTab({
  foodRecall,
  appointmentCode,
  patientName,
  editable,
  copy,
}: {
  foodRecall: FoodRecallView;
  appointmentCode: string;
  patientName: string;
  /** Catatan masih draf dan staf memegang record:write. */
  editable: boolean;
  copy?: SubjectiveCopy;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState<EditableEntry[]>(foodRecall.entries);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function doCopy() {
    setConfirmCopy(false);
    if (!copy) return;
    if (copy.append(foodRecallSubjectiveText(foodRecall.recallDate, foodRecall.entries))) {
      toast.success("Food recall disalin ke S.");
    } else {
      toast.error("Kolom S akan melebihi 5.000 karakter. Ringkas S dulu, lalu salin lagi.");
    }
  }

  function requestCopy() {
    if (copy?.has(foodRecallHeader(foodRecall.recallDate))) setConfirmCopy(true);
    else doCopy();
  }

  function startEditing() {
    setEntries(foodRecall.entries);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await saveFoodRecallByStaff({ appointmentId: foodRecall.appointmentId, entries });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Food recall disimpan.");
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan food recall. Coba lagi.");
      }
    });
  }

  const meta = [
    foodRecall.submittedAt && `Dikirim customer ${at(foodRecall.submittedAt)}`,
    foodRecall.completedAt && `Dilengkapi ${foodRecall.completedByName ?? "dokter"} ${at(foodRecall.completedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-medium">Kemarin, {foodRecall.recallDateLabel}</h3>

      {editing ? (
        <div className="space-y-3">
          <ActivityList entries={entries} onChange={setEntries} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={pending || entries.length === 0}>
              Simpan food recall
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              Batal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Setelah disimpan, link customer ditutup supaya catatan ini tidak tertimpa.</p>
        </div>
      ) : foodRecall.state === "FILLED" ? (
        <>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
          <FoodRecallTable entries={foodRecall.entries} label={`Food recall ${foodRecall.recallDateLabel}`} />
          <div className="flex flex-wrap gap-2">
            {copy && (
              <Button size="sm" onClick={requestCopy}>
                Salin ke S
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="outline" onClick={startEditing}>
                Lengkapi
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {foodRecall.state === "WAITING" ? "Customer belum mengisi food recall." : "Food recall tidak ditawarkan saat check-in."}
          </p>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                {foodRecall.state === "WAITING" ? "Buka QR dan link" : "Tawarkan sekarang"}
              </Button>
              <Button size="sm" variant="outline" onClick={startEditing}>
                Isi sendiri
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirmCopy} onOpenChange={setConfirmCopy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salin food recall lagi?</AlertDialogTitle>
            <AlertDialogDescription>Kolom S sudah memuat food recall ini.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={doCopy}>Salin lagi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {linkOpen && (
        <FoodRecallDialog
          target={{ appointmentId: foodRecall.appointmentId, code: appointmentCode, patientName }}
          open
          onOpenChange={(open) => {
            if (!open) {
              setLinkOpen(false);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
