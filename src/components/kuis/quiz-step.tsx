"use client";

import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import {
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  CONDITIONS,
  DIET_HISTORY,
  DIET_PROGRAMS,
  EXCLUSIVE,
  HEALTH_CHANGE,
  PATIENT_TYPES,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSE_HINTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  TEXT_LIMITS,
  WEIGHT_TARGETS,
} from "@/lib/kuis/v2/options";
import { conditionName, dietProgramName, selectedConditions, type StepId } from "@/lib/kuis/v2/steps";
import { stepText } from "@/lib/kuis/v2/texts";
import { MultiChoice, SingleChoice, optionsOf } from "./choice";
import {
  DietResultFields,
  ExerciseFields,
  HabitLevelFields,
  MealFields,
  MeasureFields,
  MedicationFields,
  ShortText,
  SnackFields,
  TextAnswer,
  WakeSleepFields,
  YesNoWithText,
} from "./fields";

export type AnswerPatch = (answers: QuizAnswers) => QuizAnswers;

/** Layar pilihan tunggal: maju sendiri setelah diketuk, seperti BetterMe. */
export const AUTO_ADVANCE_STEPS: readonly StepId[] = ["U1", "U2", "S1", "S2", "S4", "A2", "A3", "K4", "P2"];

type Slimming = NonNullable<QuizAnswers["slimming"]>;
type Body = NonNullable<QuizAnswers["body"]>;
type Habits = NonNullable<QuizAnswers["habits"]>;
type Aesthetic = NonNullable<QuizAnswers["aesthetic"]>;
type Health = NonNullable<QuizAnswers["health"]>;
type Returning = NonNullable<QuizAnswers["returning"]>;

const slimming = (patch: Partial<Slimming>): AnswerPatch => (a) => ({ ...a, slimming: { ...a.slimming, ...patch } });
const body = (patch: Partial<Body>): AnswerPatch => (a) => ({ ...a, body: { ...a.body, ...patch } });
const habits = (patch: Partial<Habits>): AnswerPatch => (a) => ({ ...a, habits: { ...a.habits, ...patch } });
const aesthetic = (patch: Partial<Aesthetic>): AnswerPatch => (a) => ({ ...a, aesthetic: { ...a.aesthetic, ...patch } });
const health = (patch: Partial<Health>): AnswerPatch => (a) => ({ ...a, health: { ...a.health, ...patch } });
const returning = (patch: Partial<Returning>): AnswerPatch => (a) => ({ ...a, returning: { ...a.returning, ...patch } });

type Props = {
  step: StepId;
  answers: QuizAnswers;
  onChange: (patch: AnswerPatch) => void;
  onChoose: (patch: AnswerPatch) => void;
};

export function QuizStep({ step, answers: a, onChange, onChoose }: Props) {
  const label = stepText(step, a).title;

  switch (step) {
    case "U1":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PATIENT_TYPES)}
          value={a.patientType}
          onChange={(patientType) => onChoose((x) => ({ ...x, patientType }))}
        />
      );
    case "U2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PURPOSES, PURPOSE_HINTS)}
          value={a.purpose}
          onChange={(purpose) => onChoose((x) => ({ ...x, purpose }))}
        />
      );
    case "S1":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(SLIMMING_GOALS)}
          value={a.slimming?.goal}
          onChange={(goal) => onChoose(slimming({ goal }))}
        />
      );
    case "S2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(WEIGHT_TARGETS)}
          value={a.slimming?.weightTarget}
          onChange={(weightTarget) => onChoose(slimming({ weightTarget }))}
        />
      );
    case "S3":
      return (
        <MultiChoice
          label={label}
          options={optionsOf(BODY_AREAS)}
          values={a.slimming?.areas}
          exclusive={EXCLUSIVE.areas}
          onChange={(areas) => onChange(slimming({ areas }))}
        />
      );
    case "S4":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(DIET_HISTORY)}
          value={a.slimming?.dietHistory}
          onChange={(dietHistory) => onChoose(slimming({ dietHistory }))}
        />
      );
    case "S5":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(DIET_PROGRAMS)}
            values={a.slimming?.dietPrograms}
            onChange={(dietPrograms) => onChange(slimming({ dietPrograms }))}
          />
          {a.slimming?.dietPrograms?.includes("LAINNYA") && (
            <ShortText
              label="Nama program diet lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.slimming.dietProgramOther}
              onChange={(dietProgramOther) => onChange(slimming({ dietProgramOther }))}
            />
          )}
        </>
      );
    case "S6":
      return (
        <DietResultFields
          programs={(a.slimming?.dietPrograms ?? []).map((key) => ({ key, name: dietProgramName(a, key) }))}
          value={a.slimming?.dietResults}
          onChange={(dietResults) => onChange(slimming({ dietResults }))}
        />
      );
    case "N1":
      return (
        <TextAnswer
          label="Jawaban Anda"
          maxLength={TEXT_LIMITS.story}
          value={a.nutrition?.story}
          onChange={(story) => onChange((x) => ({ ...x, nutrition: { story } }))}
        />
      );
    case "T1":
      return (
        <MeasureFields
          weightKg={a.body?.weightKg}
          heightCm={a.body?.heightCm}
          onChange={(measures) => onChange(body(measures))}
        />
      );
    case "F1":
      return (
        <WakeSleepFields
          wakeHour={a.habits?.wakeHour}
          sleepHour={a.habits?.sleepHour}
          onChange={(hours) => onChange(habits(hours))}
        />
      );
    case "F2":
      return <MealFields meal="breakfast" value={a.habits?.breakfast} onChange={(breakfast) => onChange(habits({ breakfast }))} />;
    case "F3":
      return <MealFields meal="lunch" value={a.habits?.lunch} onChange={(lunch) => onChange(habits({ lunch }))} />;
    case "F4":
      return <MealFields meal="dinner" value={a.habits?.dinner} onChange={(dinner) => onChange(habits({ dinner }))} />;
    case "F5":
      return <SnackFields label={label} value={a.habits?.snack} onChange={(snack) => onChange(habits({ snack }))} />;
    case "F6":
      return (
        <ExerciseFields label={label} value={a.habits?.exercise} onChange={(exercise) => onChange(habits({ exercise }))} />
      );
    case "F7":
      return (
        <HabitLevelFields
          value={{ smoking: a.habits?.smoking, alcohol: a.habits?.alcohol, soda: a.habits?.soda }}
          onChange={(levels) => onChange(habits(levels))}
        />
      );
    case "A1":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(SKIN_COMPLAINTS)}
            values={a.aesthetic?.complaints}
            onChange={(complaints) => onChange(aesthetic({ complaints }))}
          />
          {a.aesthetic?.complaints?.includes("LAINNYA") && (
            <ShortText
              label="Keluhan lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.aesthetic.complaintOther}
              onChange={(complaintOther) => onChange(aesthetic({ complaintOther }))}
            />
          )}
        </>
      );
    case "A2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(SKIN_TYPES)}
          value={a.aesthetic?.skinType}
          onChange={(skinType) => onChoose(aesthetic({ skinType }))}
        />
      );
    case "A3":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(COMPLAINT_DURATIONS)}
          value={a.aesthetic?.duration}
          onChange={(duration) => onChoose(aesthetic({ duration }))}
        />
      );
    case "A4":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(PRIOR_TREATMENTS)}
            values={a.aesthetic?.priorTreatments}
            exclusive={EXCLUSIVE.priorTreatments}
            onChange={(priorTreatments) => onChange(aesthetic({ priorTreatments }))}
          />
          {a.aesthetic?.priorTreatments?.includes("LAINNYA") && (
            <ShortText
              label="Treatment lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.aesthetic.priorTreatmentOther}
              onChange={(priorTreatmentOther) => onChange(aesthetic({ priorTreatmentOther }))}
            />
          )}
          <TextAnswer
            label="Skincare yang dipakai sekarang (opsional)"
            rows={2}
            maxLength={TEXT_LIMITS.long}
            value={a.aesthetic?.skincare}
            onChange={(skincare) => onChange(aesthetic({ skincare }))}
          />
        </>
      );
    case "K1":
      return (
        <>
          <MultiChoice
            label={label}
            options={optionsOf(CONDITIONS)}
            values={a.health?.conditions}
            exclusive={EXCLUSIVE.conditions}
            onChange={(conditions) => onChange(health({ conditions }))}
          />
          {a.health?.conditions?.includes("LAINNYA") && (
            <ShortText
              label="Nama penyakit lainnya"
              maxLength={TEXT_LIMITS.short}
              value={a.health.conditionOther}
              onChange={(conditionOther) => onChange(health({ conditionOther }))}
            />
          )}
        </>
      );
    case "K2":
      return (
        <MedicationFields
          conditions={selectedConditions(a).map((key) => ({ key, name: conditionName(a, key) }))}
          value={a.health?.medications}
          onChange={(medications) => onChange(health({ medications }))}
        />
      );
    case "K3":
      return (
        <div className="space-y-5">
          <YesNoWithText
            question="Obat atau suplemen lain"
            placeholder="Tulis obat/suplemen, mis. Vitamin D"
            value={a.health?.otherMeds}
            onChange={(otherMeds) => onChange(health({ otherMeds }))}
          />
          <YesNoWithText
            question="Alergi obat, makanan, atau kosmetik"
            placeholder="Tulis alerginya, mis. Amoxicillin"
            value={a.health?.allergies}
            onChange={(allergies) => onChange(health({ allergies }))}
          />
        </div>
      );
    case "K4":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(PREGNANCY)}
          value={a.health?.pregnancy}
          onChange={(pregnancy) => onChoose(health({ pregnancy }))}
        />
      );
    case "P1":
      return (
        <TextAnswer
          label="Jawaban Anda"
          maxLength={TEXT_LIMITS.story}
          value={a.returning?.story}
          onChange={(story) => onChange(returning({ story }))}
        />
      );
    case "P2":
      return (
        <SingleChoice
          label={label}
          options={optionsOf(HEALTH_CHANGE)}
          value={a.returning?.healthChanged === undefined ? undefined : a.returning.healthChanged ? "ADA" : "TIDAK"}
          onChange={(choice) => onChoose(returning({ healthChanged: choice === "ADA" }))}
        />
      );
  }
}
