"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { foodRecallHeader, foodRecallSubjectiveText, type FoodRecallAuthor, type FoodRecallView, type RecallEntry } from "@/lib/food-recall";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { ActivityListFields } from "./activity-list-fields";
import { FoodRecallDialog } from "./food-recall-dialog";
import { FoodRecallTable } from "./food-recall-table";

/** Jalan ke kolom S formulir kunjungan (spec check-in 5.2). Tidak ada saat catatan final atau hanya-baca. */
export type SubjectiveCopy = { has: (text: string) => boolean; append: (block: string) => boolean };

/** Baris di penyunting: baris lama membawa penandanya, tambahan baru belum (server menandai DOKTER atau PERAWAT). */
type EditableEntry = RecallEntry & { by?: FoodRecallAuthor };

const at = (date: Date) => `${formatShortIndonesianDate(date)} ${minutesToTimeLabel(witaMinutesOfDay(date))}`;

/** Tab "Food recall" halaman kunjungan (spec check-in bagian 5). */
export function EncounterFoodRecallTab({
  foodRecall,
  appointmentCode,
  patientName,
  editable,
  copy,
  save: saveAction = saveFoodRecallByStaff,
  customerLink = true,
}: {
  foodRecall: FoodRecallView;
  appointmentCode: string;
  patientName: string;
  /** Catatan masih draf dan staf memegang record:write (atau perawat dalam batasnya). */
  editable: boolean;
  copy?: SubjectiveCopy;
  /** Aksi simpan; halaman perawat memakai saveFoodRecallByNurse (spec peran perawat 7). */
  save?: (input: { appointmentId: string; entries: unknown; baseVersion?: string | null }) => Promise<ActionResult<void>>;
  /** false di halaman perawat: tanpa QR/link pasien dan tanpa "Tawarkan sekarang". */
  customerLink?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState<EditableEntry[]>(foodRecall.entries);
  // Versi saat penyunting dibuka: halaman bisa dimuat ulang pemberitahuan langsung selama menyunting, jadi versi
  // dari data terbaru tidak boleh dipakai (kiriman pasien di tengahnya akan tertimpa).
  const [baseVersion, setBaseVersion] = useState<string | null>(foodRecall.version);
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
    setBaseVersion(foodRecall.version);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await saveAction({ appointmentId: foodRecall.appointmentId, entries, baseVersion });
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
    <Stack spacing={1.5} sx={{ fontSize: "0.875rem" }}>
      <Typography component="h3" sx={{ fontSize: "1rem", fontWeight: 500 }}>
        Kemarin, {foodRecall.recallDateLabel}
      </Typography>

      {editing ? (
        <Stack spacing={1.5}>
          <ActivityListFields entries={entries} onChange={setEntries} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button size="small" variant="contained" onClick={save} disabled={pending || entries.length === 0}>
              Simpan food recall
            </Button>
            <Button size="small" variant="outlined" onClick={() => setEditing(false)} disabled={pending}>
              Batal
            </Button>
          </Stack>
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            Setelah disimpan, link customer ditutup supaya catatan ini tidak tertimpa.
          </Typography>
        </Stack>
      ) : foodRecall.state === "FILLED" ? (
        <>
          {meta && (
            <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
              {meta}
            </Typography>
          )}
          <FoodRecallTable entries={foodRecall.entries} label={`Food recall ${foodRecall.recallDateLabel}`} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {copy && (
              <Button size="small" variant="contained" onClick={requestCopy}>
                Salin ke S
              </Button>
            )}
            {editable && (
              <Button size="small" variant="outlined" onClick={startEditing}>
                Lengkapi
              </Button>
            )}
          </Stack>
        </>
      ) : (
        <>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {!customerLink
              ? foodRecall.state === "WAITING"
                ? "Pasien belum mengisi food recall di tablet."
                : "Belum ada food recall."
              : foodRecall.state === "WAITING"
                ? "Customer belum mengisi food recall."
                : "Food recall tidak ditawarkan saat check-in."}
          </Typography>
          {editable && !customerLink && (
            <Box>
              <Button size="small" variant="outlined" onClick={startEditing}>
                Isi food recall
              </Button>
            </Box>
          )}
          {editable && customerLink && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => setLinkOpen(true)}>
                {foodRecall.state === "WAITING" ? "Buka QR dan link" : "Tawarkan sekarang"}
              </Button>
              <Button size="small" variant="outlined" onClick={startEditing}>
                Isi sendiri
              </Button>
            </Stack>
          )}
        </>
      )}

      <Dialog open={confirmCopy} onClose={() => setConfirmCopy(false)} maxWidth="xs" slotProps={{ paper: { role: "alertdialog" } }}>
        <DialogTitle>Salin food recall lagi?</DialogTitle>
        <DialogContent>
          <DialogContentText>Kolom S sudah memuat food recall ini.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCopy(false)}>Batal</Button>
          <Button variant="contained" onClick={doCopy}>
            Salin lagi
          </Button>
        </DialogActions>
      </Dialog>

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
    </Stack>
  );
}
