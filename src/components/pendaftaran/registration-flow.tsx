"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { AUTO_ADVANCE_STEPS, QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import { QUIZ_VERSION } from "@/lib/kuis/v2/options";
import { pruneAnswers, stepError, visibleSteps, type StepId } from "@/lib/kuis/v2/steps";
import { stepText } from "@/lib/kuis/v2/texts";
import { EMPTY_WINDOW_DRAFT, onlineTotal, windowDraftsError, type WindowDraft } from "@/lib/online-consultation";
import { submitOnlineBooking, submitSiteBooking, type BookingReceipt, type OnlineReceipt } from "@/server/public-booking";
import type { BookingOptions } from "@/server/public-booking-data";
import { ContactWindowsStep } from "./contact-windows-step";
import { EMPTY_IDENTITY, IdentityStep, identityError, identityPayload, type IdentityDraft } from "./identity-step";
import { Receipt } from "./receipt";
import { ScheduleStep, type ScheduleDraft } from "./schedule-step";
import { ServiceStep, servicesFor } from "./service-step";
import { SummaryStep } from "./summary-step";

type Screen = StepId | "R" | "L" | "J" | "D";

type ConsultMode = "KLINIK" | "ONLINE";
type OnlineDraft = { staffId: string | null; windows: WindowDraft[]; submissionKey: string };

type Draft = {
  answers: QuizAnswers;
  screen: Screen;
  serviceId: string | null;
  schedule: ScheduleDraft;
  identity: IdentityDraft;
  /** Cara konsultasi (spec konsultasi online 4.1). */
  mode: ConsultMode;
  online: OnlineDraft;
};

/** Kunci kiriman online: kiriman ulang dengan kunci yang sama tidak membuat booking kedua. */
function newSubmissionKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function emptyOnline(): OnlineDraft {
  return { staffId: null, windows: [EMPTY_WINDOW_DRAFT], submissionKey: newSubmissionKey() };
}

/** Jawaban tersimpan per tab (sessionStorage), terhapus saat tab ditutup atau setelah Kirim (spec bagian 8). */
export const DRAFT_STORAGE_KEY = `sundy-daftar-v${QUIZ_VERSION}`;
/**
 * Kuitansi terakhir, agar kode booking tidak hilang bila halaman dimuat ulang. Tanpa data klinis.
 * Tidak ikut versi kuis: kuitansi yang tersimpan sebelum kuis v2 harus tetap tampil.
 */
export const RECEIPT_STORAGE_KEY = "sundy-daftar-kuitansi-v1";
/** Draf kuis versi sebelumnya — bentuknya tidak cocok lagi, jadi dibuang saat halaman dibuka. */
const LEGACY_DRAFT_KEYS = ["sundy-daftar-v1"];
const MODE = { askPatientType: true };
const EMPTY_SCHEDULE: ScheduleDraft = { branchId: null, staffId: null, date: null, hold: null };

function emptyDraft(): Draft {
  return {
    answers: {},
    screen: "U1",
    serviceId: null,
    schedule: EMPTY_SCHEDULE,
    identity: EMPTY_IDENTITY,
    mode: "KLINIK",
    online: emptyOnline(),
  };
}

function screensFor(answers: QuizAnswers): Screen[] {
  return [...visibleSteps(answers, MODE), "R", "L", "J", "D"];
}

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    // Draf dari sebelum konsultasi online tidak punya mode/online: isi dengan bawaan.
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...emptyDraft(), ...parsed, mode: parsed.mode ?? "KLINIK", online: parsed.online ?? emptyOnline() };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Mode privat atau penyimpanan penuh: kuis tetap jalan, hanya tidak bertahan saat refresh.
  }
}

/** true bila ada draf kuis versi lama yang dibuang (spec kuis v2, bagian 8). */
function discardLegacyDrafts(): boolean {
  try {
    let found = false;
    for (const key of LEGACY_DRAFT_KEYS) {
      if (window.sessionStorage.getItem(key) !== null) {
        window.sessionStorage.removeItem(key);
        found = true;
      }
    }
    return found;
  } catch {
    return false;
  }
}

function isOnlineReceipt(value: unknown): value is OnlineReceipt {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.windowLines) &&
    o.windowLines.every((line) => typeof line === "string") &&
    typeof o.servicePrice === "number" &&
    typeof o.total === "number" &&
    typeof o.maskedWhatsapp === "string"
  );
}

function isReceiptShape(
  value: unknown,
): value is Omit<BookingReceipt, "startAt" | "online"> & { startAt: string; online?: OnlineReceipt | null } {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === "string";
  return (
    text(r.code) &&
    text(r.patientName) &&
    text(r.serviceName) &&
    text(r.staffName) &&
    text(r.branchName) &&
    text(r.startAt) &&
    !Number.isNaN(new Date(r.startAt as string).getTime()) &&
    (r.bookingFee === null || (typeof r.bookingFee === "number" && Number.isFinite(r.bookingFee))) &&
    (r.bankAccount === null || text(r.bankAccount)) &&
    text(r.confirmationLink) &&
    (r.online === undefined || r.online === null || isOnlineReceipt(r.online))
  );
}

function readReceipt(): BookingReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isReceiptShape(parsed) ? { ...parsed, startAt: new Date(parsed.startAt), online: parsed.online ?? null } : null;
  } catch {
    return null;
  }
}

function writeReceipt(receipt: BookingReceipt | null) {
  try {
    if (receipt) {
      const { code, patientName, serviceName, staffName, branchName, startAt, bookingFee, bankAccount, confirmationLink, online } =
        receipt;
      window.sessionStorage.setItem(
        RECEIPT_STORAGE_KEY,
        JSON.stringify({
          code,
          patientName,
          serviceName,
          staffName,
          branchName,
          startAt: new Date(startAt).toISOString(),
          bookingFee,
          bankAccount,
          confirmationLink,
          online,
        }),
      );
    } else {
      window.sessionStorage.removeItem(RECEIPT_STORAGE_KEY);
    }
  } catch {
    // Penyimpanan tidak tersedia: kuitansi tetap tampil, hanya tidak bertahan saat refresh.
  }
}

type HistoryState = { daftar?: Screen; depth?: number } | null;

export function RegistrationFlow({ options }: { options: BookingOptions }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  // Pulihkan draf setelah hidrasi — server tidak tahu isi sessionStorage.
  useEffect(() => {
    if (discardLegacyDrafts()) toast.info("Kuis kami baru saja diperbarui. Silakan isi dari awal.");
    const savedReceipt = readReceipt();
    if (savedReceipt) setReceipt(savedReceipt);
    const saved = readDraft();
    const initial = saved ?? emptyDraft();
    if (saved) setDraft(saved);
    window.history.replaceState({ daftar: initial.screen, depth: 0 }, "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !receipt) writeDraft(draft);
  }, [draft, ready, receipt]);

  useEffect(() => {
    function onPop(event: PopStateEvent) {
      const screen = (event.state as HistoryState)?.daftar;
      if (screen) setDraft((d) => ({ ...d, screen }));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const screens = useMemo(() => screensFor(draft.answers), [draft.answers]);
  const index = Math.max(0, screens.indexOf(draft.screen));
  const screen = screens[index];
  const patientType = draft.answers.patientType ?? "BARU";
  const service =
    servicesFor(options, draft.answers).find((s) => s.id === draft.serviceId) ?? options.consultation;

  const online = options.online;
  const mode: ConsultMode = online && service.id === options.consultation.id ? draft.mode : "KLINIK";
  const onlineStaffId = draft.online.staffId ?? (online?.doctors.length === 1 ? online.doctors[0].id : null);
  const onlineScheduleError = !onlineStaffId ? "Pilih dokter lebih dulu." : windowDraftsError(draft.online.windows, "CUSTOMER", new Date());

  function finish(next: BookingReceipt) {
    writeDraft(null);
    writeReceipt(next);
    setDraft(emptyDraft());
    setReceipt(next);
  }

  function submitOnline() {
    if (!onlineStaffId || onlineScheduleError) {
      goTo("J");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitOnlineBooking({
          submissionKey: draft.online.submissionKey,
          staffId: onlineStaffId,
          windows: draft.online.windows,
          answers: pruneAnswers(draft.answers),
          identity: identityPayload(draft.identity, patientType),
          consentData: draft.identity.consentData,
          consentFee: draft.identity.consentFee,
          website: draft.identity.website,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        finish(result.data.receipt);
      } catch {
        toast.error("Pendaftaran gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  function goTo(next: Screen) {
    const depth = ((window.history.state as HistoryState)?.depth ?? 0) + 1;
    window.history.pushState({ daftar: next, depth }, "");
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
    window.history.replaceState({ daftar: previous, depth: 0 }, "");
    setDraft((d) => ({ ...d, screen: previous }));
  }

  // Mengganti tipe pasien atau tujuan bisa mengganti layanan — lepaskan pilihan layanan & jam.
  function withAnswers(d: Draft, answers: QuizAnswers): Draft {
    const serviceChanged =
      answers.patientType !== d.answers.patientType || answers.purpose !== d.answers.purpose;
    return serviceChanged
      ? { ...d, answers, serviceId: null, schedule: { ...d.schedule, hold: null } }
      : { ...d, answers };
  }

  function change(patch: AnswerPatch) {
    setDraft((d) => withAnswers(d, patch(d.answers)));
  }

  function choose(patch: AnswerPatch) {
    const answers = patch(draft.answers);
    const nextScreens = screensFor(answers);
    const next = nextScreens[nextScreens.indexOf(screen) + 1];
    setDraft((d) => withAnswers(d, answers));
    if (next) goTo(next);
  }

  function restart() {
    writeDraft(null);
    setDraft(emptyDraft());
    window.history.replaceState({ daftar: "U1", depth: 0 }, "");
  }

  function registerAgain() {
    writeReceipt(null);
    setReceipt(null);
    window.history.replaceState({ daftar: "U1", depth: 0 }, "");
  }

  function submit() {
    if (mode === "ONLINE") {
      submitOnline();
      return;
    }
    const hold = draft.schedule.hold;
    const branchId = draft.schedule.branchId;
    if (!hold || !branchId) {
      goTo("J");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitSiteBooking({
          holdToken: hold.token,
          serviceId: service.id,
          staffId: hold.staffId,
          branchId,
          startAt: hold.startAt,
          answers: pruneAnswers(draft.answers),
          identity: identityPayload(draft.identity, patientType),
          consentData: draft.identity.consentData,
          consentFee: draft.identity.consentFee,
          website: draft.identity.website,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (result.data.kind === "slot-taken") {
          toast.error("Jam itu baru saja terisi. Pilih jam lain — jawaban Anda tetap tersimpan.");
          setDraft((d) => ({ ...d, schedule: { ...d.schedule, hold: null } }));
          goTo("J");
          return;
        }
        finish(result.data.receipt);
      } catch {
        toast.error("Pendaftaran gagal dikirim. Periksa koneksi lalu coba lagi.");
      }
    });
  }

  if (receipt) return <Receipt receipt={receipt} onRegisterAgain={registerAgain} />;
  if (!ready) return <p className="px-4 py-16 text-center text-brown-600">Memuat…</p>;

  const common = { progress: (index + 1) / screens.length, onBack: index > 0 ? goBack : undefined };
  let content: ReactNode;

  if (screen === "R") {
    content = (
      <QuizScreen key="R" title="Ringkasan jawaban Anda" hint="Periksa sekali lagi. Ketuk “Ubah” untuk memperbaiki." {...common} onNext={() => goTo("L")} nextLabel="Pilih layanan & jadwal">
        <SummaryStep answers={draft.answers} onEdit={goTo} />
      </QuizScreen>
    );
  } else if (screen === "L") {
    content = (
      <QuizScreen key="L" title="Layanan & biaya" {...common} onNext={() => goTo("J")}>
        <ServiceStep
          options={options}
          answers={draft.answers}
          service={service}
          onSelect={(serviceId) => setDraft((d) => ({ ...d, serviceId, schedule: { ...d.schedule, hold: null } }))}
          mode={mode}
          onModeChange={(next) => setDraft((d) => ({ ...d, mode: next }))}
        />
      </QuizScreen>
    );
  } else if (screen === "J" && mode === "ONLINE" && online) {
    content = (
      <QuizScreen
        key="J-online"
        title="Kapan Anda bisa dihubungi?"
        hint="Dokter akan menelepon atau video call lewat WhatsApp kapan saja di dalam salah satu rentang ini. Pilih waktu Anda benar-benar bisa menjawab."
        {...common}
        error={onlineScheduleError}
        onNext={() => goTo("D")}
      >
        <ContactWindowsStep
          online={online}
          value={{ staffId: onlineStaffId, windows: draft.online.windows }}
          onChange={(patch) => setDraft((d) => ({ ...d, online: { ...d.online, ...patch } }))}
        />
      </QuizScreen>
    );
  } else if (screen === "J") {
    content = (
      <QuizScreen
        key="J"
        title="Pilih jadwal"
        hint="Jam yang Anda pilih ditahan 10 menit selama Anda mengisi data diri."
        {...common}
        error={draft.schedule.hold ? null : "Pilih tanggal dan jam lebih dulu."}
        onNext={() => goTo("D")}
      >
        <ScheduleStep
          options={options}
          service={service}
          value={draft.schedule}
          onChange={(schedule) => setDraft((d) => ({ ...d, schedule }))}
        />
      </QuizScreen>
    );
  } else if (screen === "D") {
    content = (
      <QuizScreen
        key="D"
        title="Terakhir, data diri Anda"
        {...common}
        error={identityError(draft.identity, patientType)}
        onNext={submit}
        nextLabel="Kirim pendaftaran"
        pending={pending}
      >
        <IdentityStep
          patientType={patientType}
          value={draft.identity}
          bookingFee={options.bookingFee}
          onlineTotal={
            mode === "ONLINE" && online ? onlineTotal({ bookingFee: options.bookingFee, servicePrice: online.price }) : undefined
          }
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
    <div ref={topRef} className="relative">
      {index > 0 && (
        <button
          type="button"
          onClick={restart}
          className="absolute right-4 top-6 text-xs text-brown-500 underline underline-offset-4"
        >
          Mulai ulang
        </button>
      )}
      {content}
    </div>
  );
}
