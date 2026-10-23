"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { APPROVAL_REQUIRED, isApprovalError, type ApprovalInput } from "@/lib/approval";
import { ApprovalDialog } from "./approval-dialog";

type Call = (approval?: ApprovalInput) => Promise<ActionResult<unknown>>;
type Pending = { call: Call; resolve: (result: ActionResult<unknown> | null) => void };

/**
 * Menjalankan aksi yang mungkin menuntut PIN (spec PIN P7): aksi dipanggil tanpa persetujuan dulu; bila server menjawab
 * APPROVAL_REQUIRED, kotak Persetujuan dibuka dan aksi diulang dengan penyetuju dan PIN. Galat PIN tetap di dalam
 * kotak; galat lain dan hasil sukses dikembalikan ke pemanggil. Batal = null.
 */
export function useApproval(): {
  withApproval: <T>(call: (approval?: ApprovalInput) => Promise<ActionResult<T>>) => Promise<ActionResult<T> | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  const withApproval = useCallback(async <T,>(call: (approval?: ApprovalInput) => Promise<ActionResult<T>>): Promise<ActionResult<T> | null> => {
    const first = await call();
    if (first.ok || first.error !== APPROVAL_REQUIRED) return first;
    return new Promise<ActionResult<T> | null>((resolve) => {
      setPending({ call: call as Call, resolve: resolve as Pending["resolve"] });
    });
  }, []);

  const dialog = pending ? (
    <ApprovalDialog
      onApprove={async (approval) => {
        let result: ActionResult<unknown>;
        try {
          result = await pending.call(approval);
        } catch {
          return "Gagal menyimpan. Coba lagi.";
        }
        if (!result.ok && isApprovalError(result.error)) return result.error;
        pending.resolve(result);
        setPending(null);
        return null;
      }}
      onCancel={() => {
        pending.resolve(null);
        setPending(null);
      }}
    />
  ) : null;

  return { withApproval, dialog };
}
