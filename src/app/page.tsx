'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  Clock,
  Dumbbell,
  Footprints,
  Home,
  ListChecks,
  Play,
  RefreshCw,
  ShieldAlert,
  Shirt,
  Smile,
  Sparkles,
  Target,
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
  HOME_WORKOUT_CATEGORY_LABELS,
  HOME_WORKOUT_PROTOCOLS,
  HomeWorkoutCategory,
  HomeWorkoutProtocol,
} from '@/lib/engine/homeWorkouts';
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

  const [overridePrescription, setOverridePrescription] = useState<{
    prescription: AlternativePrescription;
    mode: 'bored_swap' | 'micro_step';
  } | null>(null);

  const [boredCycleIndex, setBoredCycleIndex] = useState<number>(0);
  const [selectedHomeCategory, setSelectedHomeCategory] = useState<HomeWorkoutCategory | 'all'>(
    'all'
  );

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
        whatWeAchieveGreek: overridePrescription.prescription.whatWeAchieveGreek,
        stepByStepGreek: overridePrescription.prescription.stepByStepGreek,
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
        whatWeAchieveGreek: recommendation.whatWeAchieveGreek,
        stepByStepGreek: recommendation.stepByStepGreek,
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
      exercisesGreek: displayedPrescription.stepByStepGreek,
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

    if (boredCycleIndex === 0) {
      setOverridePrescription({
        prescription: recommendation.boredAlternative,
        mode: 'bored_swap',
      });
    } else {
      // Filter protocols appropriate for current environment when cycling
      const envPool = HOME_WORKOUT_PROTOCOLS.filter((p) => {
        if (checkIn.environment === 'indoor_clothes') return p.category === 'office_clothes';
        if (checkIn.environment === 'home_slippers')
          return p.category === 'home_slippers' || p.category === 'tendon_core';
        return true;
      });
      const pool = envPool.length > 0 ? envPool : HOME_WORKOUT_PROTOCOLS;
      const protocol = pool[(boredCycleIndex - 1) % pool.length];
      // Strictly cap duration to the user's selected timeWindowMins
      const effectiveMins = Math.min(protocol.durationMins, checkIn.timeWindowMins);

      setOverridePrescription({
        prescription: {
          id: protocol.id,
          title: `${effectiveMins}' ${protocol.titleGreek.replace(/^\d+'\s*/, '')}`,
          modality: protocol.modality,
          durationMins: effectiveMins,
          intensityLabel: protocol.intensityLabel,
          reasoningGreek: `Εναλλαγή σε πρωτόκολλο κατάλληλο για «${
            ENVIRONMENT_LABELS_GREEK[checkIn.environment]
          }» προσαρμοσμένο στα ${effectiveMins} διαθέσιμα λεπτά σου.`,
          whatWeAchieveGreek: protocol.whatWeAchieveGreek,
          stepByStepGreek: protocol.exercisesGreek,
          habitPointsAward: protocol.habitPointsAward,
          structuralPointsAward: protocol.structuralPointsAward,
        },
        mode: 'bored_swap',
      });
    }
    setBoredCycleIndex((prev) => prev + 1);
  };

  const handleSelectHomeProtocol = (protocol: HomeWorkoutProtocol) => {
    setCompletionBanner(null);
    const effectiveMins = Math.min(protocol.durationMins, checkIn.timeWindowMins);
    setOverridePrescription({
      prescription: {
        id: protocol.id,
        title:
          effectiveMins !== protocol.durationMins
            ? `${effectiveMins}' ${protocol.titleGreek.replace(/^\d+'\s*/, '')} (Προσαρμοσμένο στα ${effectiveMins}')`
            : protocol.titleGreek,
        modality: protocol.modality,
        durationMins: effectiveMins,
        intensityLabel: protocol.intensityLabel,
        reasoningGreek: `Επιλέχθηκε από τη βιβλιοθήκη εκγύμνασης (${protocol.equipmentGreek}).`,
        whatWeAchieveGreek: protocol.whatWeAchieveGreek,
        stepByStepGreek: protocol.exercisesGreek,
        habitPointsAward: protocol.habitPointsAward,
        structuralPointsAward: protocol.structuralPointsAward,
      },
      mode: 'bored_swap',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const filteredHomeWorkouts = useMemo(() => {
    if (selectedHomeCategory === 'all') return HOME_WORKOUT_PROTOCOLS;
    return HOME_WORKOUT_PROTOCOLS.filter((p) => p.category === selectedHomeCategory);
  }, [selectedHomeCategory]);

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
                recommendation.mosScore < 40 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {recommendation.mosScore}/100
            </div>
          </div>
        </div>

        {/* Dual Metrics Compact Bar */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-zinc-800/80 pt-3">
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
                  : 'Εναλλακτική Επιλογή'}
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

        {/* 1. WHAT WE ACHIEVE IN THE BODY (Τι πετυχαίνουμε) */}
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <Target className="h-4 w-4 text-emerald-400" />
            <span>Τι πετυχαίνουμε με αυτή την κίνηση:</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-200">
            {displayedPrescription.whatWeAchieveGreek}
          </p>
        </div>

        {/* 2. EXACT STEP-BY-STEP INSTRUCTIONS (Τι κάνω ακριβώς βήμα-βήμα) */}
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
            <ListChecks className="h-4 w-4 text-emerald-400" />
            <span>Τι κάνω ακριβώς (Βήμα-Βήμα):</span>
          </div>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-200">
            {displayedPrescription.stepByStepGreek.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. Plain-Greek Reasoning Box (Γιατί προτείνεται αυτό σήμερα) */}
        <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Γιατί προτείνεται αυτό σήμερα</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
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
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100">
            Ρύθμιση Πραγματικής Κατάστασης (Check-in)
          </h3>
          <span className="text-[11px] text-zinc-400">Αλλάζει άμεσα την πρόταση</span>
        </div>

        {/* Time Window Micro-Windows (Moved to top of check-in for instant access) */}
        <div>
          <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-400" />
              Διαθέσιμος Χρόνος (Αυστηρό Ανώτατο Όριο)
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

        {/* Environment Friction: Γραφείο vs Σπίτι/Παντόφλα vs Σπίτι/Αθλητικά vs Έξω */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Shirt className="h-4 w-4 text-emerald-400" />
            <span>Πού βρίσκεσαι & τι φοράς τώρα;</span>
          </label>
          <div className="mt-2 space-y-1.5">
            {(
              [
                'indoor_clothes',
                'home_slippers',
                'home_gear',
                'outdoor',
              ] as EnvironmentType[]
            ).map((env) => (
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
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </div>
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

        {/* Pain Level (Safety Gate Trigger at >= 4) */}
        <div className="border-t border-zinc-800 pt-2">
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

      {/* HOME & OFFICE WORKOUT ALTERNATIVES HUB */}
      <section
        aria-label="Εναλλακτικές Εκγύμνασης Σπιτιού & Γραφείου"
        className="space-y-3.5 rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-emerald-400">
              <Home className="h-4 w-4" />
              <h3 className="text-sm font-bold text-zinc-100">
                Εναλλακτικές Ασκήσεις (Γραφείο, Σπίτι με Παντόφλα & Γυμναστική)
              </h3>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Σαφείς οδηγίες βήμα-βήμα ανάλογα με το αν είσαι στο γραφείο, στον καναπέ με παντόφλα ή
              έτοιμος για γυμναστική στο σπίτι.
            </p>
          </div>
          <Dumbbell className="h-5 w-5 shrink-0 text-zinc-500" />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedHomeCategory('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              selectedHomeCategory === 'all'
                ? 'bg-emerald-500 text-zinc-950'
                : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Όλα ({HOME_WORKOUT_PROTOCOLS.length})
          </button>
          {(Object.keys(HOME_WORKOUT_CATEGORY_LABELS) as HomeWorkoutCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedHomeCategory(cat)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedHomeCategory === cat
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {HOME_WORKOUT_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Protocol Cards List */}
        <div className="space-y-2.5 pt-1">
          {filteredHomeWorkouts.map((proto) => (
            <div
              key={proto.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3.5 transition hover:border-emerald-500/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {proto.categoryLabelGreek} • {proto.equipmentGreek}
                  </span>
                  <h4 className="mt-1 text-xs font-bold text-zinc-100">{proto.titleGreek}</h4>
                </div>
                <span className="shrink-0 rounded-lg bg-zinc-900 px-2 py-1 text-xs font-bold text-emerald-400">
                  {proto.durationMins}&apos;
                </span>
              </div>

              <div className="mt-2 rounded-lg bg-emerald-500/5 p-2 text-[11px] leading-relaxed text-emerald-200/90">
                <strong>Τι πετυχαίνουμε: </strong>
                {proto.whatWeAchieveGreek}
              </div>

              <ul className="mt-2 space-y-1.5 border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-200">
                {proto.exercisesGreek.map((ex, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-900 pt-2.5">
                <span className="text-[11px] font-medium text-zinc-400">
                  +{proto.habitPointsAward} Συνέπεια • +{proto.structuralPointsAward} Δομική Ανοχή
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectHomeProtocol(proto)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    Επιλογή
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTimer({
                        title: proto.titleGreek,
                        modality: proto.modality,
                        durationMins: proto.durationMins,
                        intensityLabel: proto.intensityLabel,
                        habitPointsAward: proto.habitPointsAward,
                        structuralPointsAward: proto.structuralPointsAward,
                        wasNegotiated: 'bored_swap',
                        exercisesGreek: proto.exercisesGreek,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    Έναρξη ({proto.durationMins}&apos;)
                  </button>
                </div>
              </div>
            </div>
          ))}
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
