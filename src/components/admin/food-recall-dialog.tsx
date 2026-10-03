"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";
import { getFoodRecallLink, offerFoodRecall } from "@/server/food-recall-admin";
import { FoodRecallLinkPanel } from "./food-recall-link-panel";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Food recall — {target.code}</DialogTitle>
          <DialogDescription>{target.patientName}</DialogDescription>
        </DialogHeader>
        {info === undefined ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : info === null ? (
          <p className="text-sm text-muted-foreground">Food recall gagal dimuat. Coba lagi.</p>
        ) : info.state === "NOT_OFFERED" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Food recall belum ditawarkan saat check-in.</p>
            <Button type="button" className="w-full" disabled={pending} onClick={offer}>
              Tawarkan food recall
            </Button>
          </div>
        ) : (
          <FoodRecallLinkPanel info={info} />
        )}
      </DialogContent>
    </Dialog>
  );
}
