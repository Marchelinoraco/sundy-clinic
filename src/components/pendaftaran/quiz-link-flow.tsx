"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { AUTO_ADVANCE_STEPS, QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import { formatScheduleForMessage } from "@/lib/format";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { pruneAnswers, stepError, visibleSteps, type StepId } from "@/lib/kuis/v2/steps";
import { stepText } from "@/lib/kuis/v2/texts";
import { patientTypeForKind, type QuizLinkPage } from "@/lib/quiz-link";
import { submitQuizLink } from "@/server/quiz-link-public";
import {
  EMPTY_LINK_IDENTITY,
  LinkIdentityStep,
  linkIdentityError,
  linkIdentityPayload,
  type LinkIdentityDraft,
} from "./link-identity-step";
import { SummaryStep } from "./summary-step";

type OpenPage = Extract<QuizLinkPage, { state: "OPEN" }>;
type Screen = StepId | "R" | "D";
type Draft = { answers: QuizAnswers; screen: Screen; identity: LinkIdentityDraft };
/** Layar disimpan di riwayat browser agar tombol Kembali ponsel mundur satu pertanyaan, seperti /daftar. */
type HistoryState = { isi?: Screen; depth?: number } | null;

/** Jenis kuis sudah ditentukan sistem, jadi "Pernah konsultasi?" (U1) tidak ditanyakan (spec C3 3.2). */
const MODE = { askPatientType: false };

/** Draf per tab dan per booking (sessionStorage), terhapus setelah Kirim. */
export function linkDraftKey(code: string): string {
  return `sundy-isi-v${QUIZ_VERSION}-${code.split(".")[0]}`;
}

function screensFor(answers: QuizAnswers): Screen[] {
  return [...visibleSteps(answers, MODE), "R", "D"];
}

function emptyDraft(page: OpenPage): Draft {
  return { answers: { patientType: patientTypeForKind(page.kind) }, screen: "U2", identity: EMPTY_LINK_IDENTITY };
}

function readDraft(key: string, page: OpenPage): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // Jenis kuis bisa berubah sejak draf disimpan (mis. isian lengkap dari booking lain): mulai ulang.
    return draft.answers?.patientType === patientTypeForKind(page.kind) ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Mode privat atau penyimpanan penuh: kuis tetap jalan, hanya tidak bertahan saat dimuat ulang.
  }
}

/** Kuis v2 untuk booking yang dicatat admin, tanpa layanan dan jadwal (spec C3 bagian 3). */
export function QuizLinkFlow({
  code,
  page,
  onSubmitted,
}: {
  code: string;
  page: OpenPage;
  onSubmitted: () => void;
}) {
  const key = linkDraftKey(code);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(page));
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  // Pulihkan draf setelah hidrasi — server tidak tahu isi sessionStorage.
  // replaceState/pushState tanpa URL mempertahankan URL sekarang, termasuk kode setelah "#".
  useEffect(() => {
    const saved = readDraft(key, page);
    const initial = saved ?? emptyDraft(page);
    if (saved) setDraft(saved);
    window.history.replaceState({ isi: initial.screen, depth: 0 }, "");
    setReady(true);
  }, [key, page]);

  useEffect(() => {
    if (ready) writeDraft(key, draft);
  }, [key, draft, ready]);

  useEffect(() => {
    function onPop(event: PopStateEvent) {
      const screen = (event.state as HistoryState)?.isi;
      if (screen) setDraft((d) => ({ ...d, screen }));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const screens = useMemo(() => screensFor(draft.answers), [draft.answers]);
  const index = Math.max(0, screens.indexOf(draft.screen));
  const screen = screens[index];

  function goTo(next: Screen) {
    const depth = ((window.history.state as HistoryState)?.depth ?? 0) + 1;
    window.history.pushState({ isi: next, depth }, "");
    setDraft((d) => ({ ...d, screen: next }));
    topRef.current?.scrollIntoView?.({ block: "start" });
  }

  function goBack() {
    if (((window.history.state as HistoryState)?.depth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const previous = screens[index - 1];
    if (!previous) return;
    window.history.replaceState({ isi: previous, depth: 0 }, "");
    setDraft((d) => ({ ...d, screen: previous }));
  }

  function change(patch: AnswerPatch) {
    setDraft((d) => ({ ...d, answers: patch(d.answers) }));
  }

  function choose(patch: AnswerPatch) {
    const answers = patch(draft.answers);
    const nextScreens = screensFor(answers);
    const next = nextScreens[nextScreens.indexOf(screen) + 1];
    setDraft((d) => ({ ...d, answers }));
    if (next) goTo(next);
  }

  function submit() {
    startTransition(async () => {
      try {
        const result = await submitQuizLink({
          code,
          answers: pruneAnswers(draft.answers),
          identity: linkIdentityPayload(draft.identity, page.missing),
          consentData: draft.identity.consentData,
          consentFee: draft.identity.consentFee,
          website: draft.identity.website,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        writeDraft(key, null);
        onSubmitted();
      } catch {
        toast.error("Form gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  if (!ready) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;

  const common = { progress: (index + 1) / screens.length, onBack: index > 0 ? goBack : undefined };
  let content: ReactNode;

  if (screen === "R") {
    content = (
      <QuizScreen
        key="R"
        title="Ringkasan jawaban Anda"
        hint="Periksa sekali lagi. Ketuk “Ubah” untuk memperbaiki."
        {...common}
        onNext={() => goTo("D")}
      >
        <SummaryStep answers={draft.answers} onEdit={goTo} />
      </QuizScreen>
    );
  } else if (screen === "D") {
    content = (
      <QuizScreen
        key="D"
        title={page.missing.length > 0 ? "Terakhir, data diri Anda" : "Terakhir, persetujuan Anda"}
        {...common}
        error={linkIdentityError(draft.identity, page.missing, page.feeConsent)}
        onNext={submit}
        nextLabel="Kirim"
        pending={pending}
      >
        <LinkIdentityStep
          missing={page.missing}
          feeConsent={page.feeConsent}
          value={draft.identity}
          onChange={(identity) => setDraft((d) => ({ ...d, identity }))}
        />
      </QuizScreen>
    );
  } else {
    const text = stepText(screen, draft.answers);
    const auto = AUTO_ADVANCE_STEPS.includes(screen);
    content = (
      <QuizScreen
        key={screen}
        title={text.title}
        hint={text.hint}
        {...common}
        error={stepError(screen, draft.answers)}
        onNext={auto ? undefined : () => goTo(screens[index + 1])}
      >
        <QuizStep step={screen} answers={draft.answers} onChange={change} onChoose={choose} />
      </QuizScreen>
    );
  }

  return (
    <div ref={topRef}>
      <header className="mx-auto max-w-md px-4 pt-8 text-center">
        <p className="font-display text-2xl text-brown-900">Halo {page.firstName}</p>
        <p className="mt-1 text-sm text-brown-700">
          {page.serviceName} · {formatScheduleForMessage(page.startAt)}
        </p>
        <p className="text-sm text-brown-600">
          {page.staffName} · {page.branchName}
        </p>
      </header>
      {content}
    </div>
  );
}
