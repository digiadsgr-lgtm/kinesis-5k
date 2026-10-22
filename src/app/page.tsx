'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Clock,
  Flame,
  Footprints,
  Play,
  RefreshCw,
  ShieldAlert,
  Shirt,
  Smile,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react';
import {
  AlternativePrescription,
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  EnergyScore,
  EnvironmentType,
  ENVIRONMENT_LABELS_GREEK,
  MODALITY_LABELS_GREEK,
  MoodScore,
  RejectionEvent,
  STAGES,
  UserProgressionState,
} from '@/types/kinesis';
import { calculateRecommendation } from '@/lib/engine/recommender';
import {
  DEFAULT_BIOMARKERS,
  DEFAULT_BIOMETRICS,
  DEFAULT_CHECK_IN,
  DEFAULT_PROGRESSION,
  getKinesisSnapshot,
  recordMovementLog,
  recordRejection,
  saveCheckIn,
} from '@/lib/storage/db';
import SessionTimer, { ActiveTimerSession } from '@/components/SessionTimer';

const TIME_WINDOWS = [2, 5, 10, 15, 20, 30, 45];

export default function TodayCommandCenter() {
  const [progression, setProgression] = useState<UserProgressionState>(DEFAULT_PROGRESSION);
  const [biometrics, setBiometrics] = useState<DailyBiometrics>(DEFAULT_BIOMETRICS);
  const [biomarkers, setBiomarkers] = useState<BiomarkerProfile>(DEFAULT_BIOMARKERS);
  const [rejections, setRejections] = useState<RejectionEvent[]>([]);
  const [checkIn, setCheckIn] = useState<CheckInInput>(DEFAULT_CHECK_IN);
  const [isLoaded, setIsLoaded] = useState(false);

  // Negotiated override (when user taps "Σήμερα δυσκολεύομαι πολύ" or "Μπορώ, αλλά βαριέμαι")
  const [overridePrescription, setOverridePrescription] = useState<{
    prescription: AlternativePrescription;
    mode: 'bored_swap' | 'micro_step';
  } | null>(null);

  const [activeTimer, setActiveTimer] = useState<ActiveTimerSession | null>(null);
  const [completionBanner, setCompletionBanner] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const snap = await getKinesisSnapshot();
    setProgression(snap.progression);
    setBiometrics(snap.biometrics);
    setBiomarkers(snap.biomarkers);
    setRejections(snap.rejections);
    if (snap.progression.lastCheckIn) {
      setCheckIn(snap.progression.lastCheckIn);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateCheckInField = async <K extends keyof CheckInInput>(
    field: K,
    value: CheckInInput[K]
  ) => {
    const next: CheckInInput = { ...checkIn, [field]: value };
    setCheckIn(next);
    setOverridePrescription(null);
    await saveCheckIn(next);
  };

  const recommendation = useMemo(() => {
    return calculateRecommendation(
      checkIn,
      progression.currentStage,
      biometrics,
      biomarkers,
      rejections
    );
  }, [checkIn, progression.currentStage, biometrics, biomarkers, rejections]);

  const displayedPrescription = overridePrescription
    ? {
        title: overridePrescription.prescription.title,
        modality: overridePrescription.prescription.modality,
        durationMins: overridePrescription.prescription.durationMins,
        intensityLabel: overridePrescription.prescription.intensityLabel,
        reasoningGreek: overridePrescription.prescription.reasoningGreek,
        habitPointsAward: overridePrescription.prescription.habitPointsAward,
        structuralPointsAward: overridePrescription.prescription.structuralPointsAward,
        negotiatedMode: overridePrescription.mode,
      }
    : {
        title: recommendation.title,
        modality: recommendation.modality,
        durationMins: recommendation.durationMins,
        intensityLabel: recommendation.intensityLabel,
        reasoningGreek: recommendation.reasoningGreek,
        habitPointsAward: recommendation.habitPointsAward,
        structuralPointsAward: recommendation.structuralPointsAward,
        negotiatedMode: 'primary' as const,
      };

  const handleStartPrimary = () => {
    setCompletionBanner(null);
    setActiveTimer({
      title: displayedPrescription.title,
      modality: displayedPrescription.modality,
      durationMins: displayedPrescription.durationMins,
      intensityLabel: displayedPrescription.intensityLabel,
      habitPointsAward: displayedPrescription.habitPointsAward,
      structuralPointsAward: displayedPrescription.structuralPointsAward,
      wasNegotiated: displayedPrescription.negotiatedMode,
    });
  };

  const handleBoredSwap = async () => {
    setCompletionBanner(null);
    const currentModality = displayedPrescription.modality;
    const event = await recordRejection(
      currentModality,
      'boredom',
      progression.currentStage,
      recommendation.mosScore
    );
    const updatedRejections = [event, ...rejections];
    setRejections(updatedRejections);
    setOverridePrescription({
      prescription: recommendation.boredAlternative,
      mode: 'bored_swap',
    });
  };

  const handleHardDowngrade = async () => {
    setCompletionBanner(null);
    setOverridePrescription({
      prescription: recommendation.hardDowngrade,
      mode: 'micro_step',
    });
  };

  const handleCompleteTimer = async (actualMins: number, rpe: number, notes: string) => {
    if (!activeTimer) return;
    const result = await recordMovementLog({
      title: activeTimer.title,
      modality: activeTimer.modality,
      durationMins: actualMins,
      intensityLabel: activeTimer.intensityLabel,
      habitPointsEarned: activeTimer.habitPointsAward,
      structuralPointsEarned: activeTimer.structuralPointsAward,
      rpe,
      notes,
      wasNegotiated: activeTimer.wasNegotiated,
    });

    setProgression(result.progression);
    setActiveTimer(null);
    setOverridePrescription(null);

    if (result.stageAdvanced) {
      setCompletionBanner(
        `Συγχαρητήρια! Πέρασες στο ${STAGES[result.progression.currentStage].code}: ${
          STAGES[result.progression.currentStage].titleGreek
        }.`
      );
    } else {
      setCompletionBanner(
        `Καταγράφηκε! +${activeTimer.habitPointsAward} Συνέπεια & +${activeTimer.structuralPointsAward} Δομική Ανοχή.`
      );
    }
  };

  const currentStageDef = STAGES[progression.currentStage];

  return (
    <div className="space-y-5">
      {/* Top Status Header */}
      <header className="rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-400">
              <Zap className="h-3 w-3" />
              {currentStageDef.code} • {currentStageDef.titleGreek}
            </span>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-50">
              KINESIS: Το Επόμενο Βήμα
            </h1>
          </div>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">MOS Σήμερα</span>
            <div
              className={`text-lg font-bold ${
                recommendation.mosScore < 40
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {recommendation.mosScore}/100
            </div>
          </div>
        </div>

        {/* Dual Metrics Compact Bar */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/80">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Συνέπεια Εκκίνησης</span>
              <span className="font-semibold text-emerald-400">
                {progression.habitConsistencyScore}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progression.habitConsistencyScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Δρομική Ετοιμότητα</span>
              <span className="font-semibold text-zinc-200">{progression.runningReadiness}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-400/75 transition-all duration-500"
                style={{ width: `${progression.runningReadiness}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Completion Notification Banner */}
      {completionBanner && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-medium">{completionBanner}</p>
            <p className="mt-0.5 text-xs text-emerald-300/80">
              Χωρίς ημερολόγια ενοχών — μόνο το επόμενο ρεαλιστικό βήμα.
            </p>
          </div>
        </div>
      )}

      {/* Safety Gate & Biomarker Alerts */}
      {recommendation.safetyAlertsGreek.length > 0 && (
        <section
          aria-label="Ειδοποιήσεις Ασφαλείας & Βιοδεικτών"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Ενεργό Πρωτόκολλο Προστασίας & Βιοδεικτών</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-200/90">
            {recommendation.safetyAlertsGreek.map((alert, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{alert}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PROMINENT PRIMARY RECOMMENDATION CARD ("Το Επόμενο Βήμα") */}
      <section
        aria-label="Το Επόμενο Βήμα"
        className="relative overflow-hidden rounded-2xl border border-emerald-500/35 bg-zinc-900 p-5 shadow-xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <Footprints className="h-3.5 w-3.5" />
            {MODALITY_LABELS_GREEK[displayedPrescription.modality]}
          </span>

          <div className="flex items-center gap-2">
            {overridePrescription && (
              <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {overridePrescription.mode === 'micro_step'
                  ? 'Micro-Step Ενεργό'
                  : 'Εναλλαγή Βαρεμάρας'}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-200">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              {displayedPrescription.durationMins} λεπτά
            </span>
          </div>
        </div>

        <h2 className="mt-3 text-xl font-bold leading-snug text-zinc-50">
          {displayedPrescription.title}
        </h2>

        <p className="mt-1 text-xs font-medium text-emerald-400/90">
          {displayedPrescription.intensityLabel}
        </p>

        {/* Plain-Greek Reasoning Box */}
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Γιατί προτείνεται αυτό σήμερα</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
            {displayedPrescription.reasoningGreek}
          </p>
        </div>

        {/* Points Reward Preview */}
        <div className="mt-3.5 flex items-center justify-between text-xs text-zinc-400">
          <span>Επιβράβευση εκτέλεσης:</span>
          <div className="flex items-center gap-3 font-medium">
            <span className="text-emerald-400">
              +{displayedPrescription.habitPointsAward} Συνέπεια
            </span>
            <span className="text-zinc-300">
              +{displayedPrescription.structuralPointsAward} Δομική Ανοχή
            </span>
          </div>
        </div>

        {/* 3-BUTTON FRICTION NEGOTIATOR */}
        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={handleStartPrimary}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]"
          >
            <Play className="h-4 w-4 fill-current" />
            Πολύ εύκολη, ξεκινάω ({displayedPrescription.durationMins}&apos;)
          </button>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleBoredSwap}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/70 px-3 py-3 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
              Μπορώ, αλλά βαριέμαι
            </button>

            <button
              type="button"
              onClick={handleHardDowngrade}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/70 px-3 py-3 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
              Σήμερα δυσκολεύομαι πολύ
            </button>
          </div>
        </div>
      </section>

      {/* REAL-TIME CHECK-IN PANEL */}
      <section
        aria-label="Σημερινή Κατάσταση & Κόστος Εκκίνησης"
        className="rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100">
            Ρύθμιση Πραγματικής Κατάστασης (Check-in)
          </h3>
          <span className="text-[11px] text-zinc-400">Αλλάζει άμεσα την πρόταση</span>
        </div>

        {/* Mood 1-5 */}
        <div>
          <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Smile className="h-4 w-4 text-emerald-400" />
              Ψυχολογική Διάθεση
            </span>
            <span className="font-semibold text-emerald-400">{checkIn.mood}/5</span>
          </label>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {([1, 2, 3, 4, 5] as MoodScore[]).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => updateCheckInField('mood', val)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  checkIn.mood === val
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Energy 1-5 */}
        <div>
          <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Battery className="h-4 w-4 text-emerald-400" />
              Σωματική Ενέργεια
            </span>
            <span className="font-semibold text-emerald-400">{checkIn.energy}/5</span>
          </label>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {([1, 2, 3, 4, 5] as EnergyScore[]).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => updateCheckInField('energy', val)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  checkIn.energy === val
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Time Window Micro-Windows */}
        <div>
          <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-400" />
              Διαθέσιμο Παράθυρο Χρόνου
            </span>
            <span className="font-semibold text-emerald-400">{checkIn.timeWindowMins} λεπτά</span>
          </label>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {TIME_WINDOWS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => updateCheckInField('timeWindowMins', mins)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  checkIn.timeWindowMins === mins
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mins}&apos;
              </button>
            ))}
          </div>
        </div>

        {/* Environment Friction */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Shirt className="h-4 w-4 text-emerald-400" />
            <span>Περιβάλλον & Τριβή Εξοπλισμού</span>
          </label>
          <div className="mt-2 space-y-1.5">
            {(['indoor_clothes', 'home_gear', 'outdoor'] as EnvironmentType[]).map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => updateCheckInField('environment', env)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition ${
                  checkIn.environment === env
                    ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{ENVIRONMENT_LABELS_GREEK[env]}</span>
                {checkIn.environment === env && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pain Level (Safety Gate Trigger at >= 4) */}
        <div className="pt-2 border-t border-zinc-800">
          <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5">
              <AlertTriangle
                className={`h-4 w-4 ${
                  checkIn.painLevel >= 4 ? 'text-amber-400' : 'text-zinc-400'
                }`}
              />
              Επίπεδο Πόνου / Ενόχλησης (Safety Gate ≥ 4)
            </span>
            <span
              className={`rounded px-2 py-0.5 font-bold ${
                checkIn.painLevel >= 4
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {checkIn.painLevel}/10
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={checkIn.painLevel}
            onChange={(e) => updateCheckInField('painLevel', Number(e.target.value))}
            className="mt-2.5 w-full"
          />
          {checkIn.painLevel > 0 && (
            <input
              type="text"
              value={checkIn.painLocation}
              onChange={(e) => updateCheckInField('painLocation', e.target.value)}
              placeholder="Σημείο ενόχλησης (π.χ. δεξί γόνατο, Αχίλλειος, μέση)"
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          )}
        </div>
      </section>

      {/* Active Session Timer Modal */}
      {activeTimer && (
        <SessionTimer
          session={activeTimer}
          onComplete={handleCompleteTimer}
          onCancel={() => setActiveTimer(null)}
        />
      )}

      {!isLoaded && (
        <p className="text-center text-xs text-zinc-500">Φόρτωση τοπικής βάσης KINESIS...</p>
      )}
    </div>
  );
}
