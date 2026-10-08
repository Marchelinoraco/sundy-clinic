"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";
import { getFoodRecallLink, offerFoodRecall } from "@/server/food-recall-admin";
import { FoodRecallLinkPanel } from "./food-recall-link-panel";
import { DialogCloseButton } from "./mui/dialog-close-button";

export type FoodRecallTarget = { appointmentId: string; code: string; patientName: string };

/** Aksi "Food recall" di baris booking (spec check-in 4.4): buka lagi link, atau tawarkan bila belum. */
export function FoodRecallDialog({
  target,
  open,
  onOpenChange,
}: {
  target: FoodRecallTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // undefined = masih dimuat; null = gagal dimuat.
  const [info, setInfo] = useState<FoodRecallLinkInfo | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getFoodRecallLink(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          setInfo(null);
          return;
        }
        setInfo(result.data);
      })
      .catch(() => {
        if (current) setInfo(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  function offer() {
    startTransition(async () => {
      try {
        const result = await offerFoodRecall(target.appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setInfo(result.data);
        router.refresh();
      } catch {
        toast.error("Gagal menawarkan food recall. Coba lagi.");
      }
    });
  }

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="xs">
      <DialogTitle sx={{ pr: 6 }}>Food recall — {target.code}</DialogTitle>
      <DialogCloseButton onClick={() => onOpenChange(false)} />
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{target.patientName}</DialogContentText>
        {info === undefined ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Memuat…
          </Typography>
        ) : info === null ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Food recall gagal dimuat. Coba lagi.
          </Typography>
        ) : info.state === "NOT_OFFERED" ? (
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Food recall belum ditawarkan saat check-in.
            </Typography>
            <Button type="button" variant="contained" fullWidth disabled={pending} onClick={offer}>
              Tawarkan food recall
            </Button>
          </Stack>
        ) : (
          <FoodRecallLinkPanel info={info} />
        )}
      </DialogContent>
    </Dialog>
  );
}
