'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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

const MOOD_LABELS: Record<MoodScore, string> = {
  1: 'Πεσμένη',
  2: 'Μέτρια',
  3: 'Ήρεμη',
  4: 'Καλή',
  5: 'Εξαιρετική',
};

const ENERGY_LABELS: Record<EnergyScore, string> = {
  1: 'Κουρασμένος',
  2: 'Χαμηλή',
  3: 'Κανονική',
  4: 'Δυνατή',
  5: 'Γεμάτος',
};

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
  const [expandedProtocolId, setExpandedProtocolId] = useState<string | null>(
    HOME_WORKOUT_PROTOCOLS[0]?.id ?? null
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
      const envPool = HOME_WORKOUT_PROTOCOLS.filter((p) => {
        if (checkIn.environment === 'indoor_clothes') return p.category === 'office_clothes';
        if (checkIn.environment === 'home_slippers')
          return p.category === 'home_slippers' || p.category === 'tendon_core';
        return true;
      });
      const pool = envPool.length > 0 ? envPool : HOME_WORKOUT_PROTOCOLS;
      const protocol = pool[(boredCycleIndex - 1) % pool.length];
      const effectiveMins = Math.min(protocol.durationMins, checkIn.timeWindowMins);

      setOverridePrescription({
        prescription: {
          id: protocol.id,
          title: `${effectiveMins}' ${protocol.titleGreek.replace(/^\d+'\s*/, '')}`,
          modality: protocol.modality,
          durationMins: effectiveMins,
          intensityLabel: `${protocol.intensityLabel} • Χωρίς Εξοπλισμό`,
          reasoningGreek: `Εναλλαγή σε πρόγραμμα κατάλληλο για τον χώρο σου, προσαρμοσμένο στα ${effectiveMins} διαθέσιμα λεπτά σου.`,
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
            ? `${effectiveMins}' ${protocol.titleGreek.replace(/^\d+'\s*/, '')}`
            : protocol.titleGreek,
        modality: protocol.modality,
        durationMins: effectiveMins,
        intensityLabel: `${protocol.intensityLabel} • Χωρίς Εξοπλισμό`,
        reasoningGreek: `Επιλέχθηκε από τη βιβλιοθήκη προγραμμάτων σπιτιού (100% χωρίς εξοπλισμό).`,
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
        `Μπράβο! Κέρδισες +${activeTimer.habitPointsAward} πόντους Συνέπειας & +${activeTimer.structuralPointsAward} πόντους Δύναμης.`
      );
    }
  };

  const currentStageDef = STAGES[progression.currentStage];

  const filteredHomeWorkouts = useMemo(() => {
    if (selectedHomeCategory === 'all') return HOME_WORKOUT_PROTOCOLS;
    return HOME_WORKOUT_PROTOCOLS.filter((p) => p.category === selectedHomeCategory);
  }, [selectedHomeCategory]);

  return (
    <div className="space-y-4">
      {/* Top Status Header */}
      <header className="rounded-2xl border border-zinc-800/90 bg-zinc-900/95 p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-400">
              <Zap className="h-3 w-3" />
              {currentStageDef.code} • {currentStageDef.titleGreek}
            </span>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-50">
              Το Επόμενο Βήμα Σου
            </h1>
          </div>
          <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-right">
            <span className="block text-[10px] font-medium text-zinc-400">Ετοιμότητα</span>
            <span
              className={`text-sm font-bold ${
                recommendation.mosScore < 40 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {recommendation.mosScore}/100
            </span>
          </div>
        </div>

        {/* Dual Metrics Compact Bar */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-zinc-800/80 pt-3">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Συνήθεια & Συνέπεια</span>
              <span className="font-bold text-emerald-400">
                {progression.habitConsistencyScore}%
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progression.habitConsistencyScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Αντοχή Ποδιών (5K)</span>
              <span className="font-bold text-zinc-100">{progression.runningReadiness}%</span>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
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
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-bold">{completionBanner}</p>
            <p className="mt-0.5 text-xs text-emerald-200/80">
              Κάθε κίνηση χτίζει το σώμα σου χωρίς άγχος και χωρίς ενοχές.
            </p>
          </div>
        </div>
      )}

      {/* Safety Gate & Biomarker Alerts */}
      {recommendation.safetyAlertsGreek.length > 0 && (
        <section
          aria-label="Ειδοποιήσεις Ασφαλείας & Υγείας"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Προστασία Σώματος & Υγείας</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-100">
            {recommendation.safetyAlertsGreek.map((alert, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{alert}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* QUICK CHECK-IN CONTROLS (Compact, Mobile-First Thumb Reach) */}
      <section
        aria-label="Γρήγορη Ρύθμιση Σημερινής Κατάστασης"
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-4"
      >
        {/* 1. Time Window Selector */}
        <div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
              <Clock className="h-4 w-4 text-emerald-400" />
              1. Πόσα λεπτά έχεις διαθέσιμα τώρα;
            </span>
            <span className="rounded-lg bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
              {checkIn.timeWindowMins} λεπτά
            </span>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {TIME_WINDOWS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => updateCheckInField('timeWindowMins', mins)}
                className={`min-h-[44px] rounded-xl text-xs font-bold transition active:scale-95 ${
                  checkIn.timeWindowMins === mins
                    ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {mins}&apos;
              </button>
            ))}
          </div>
        </div>

        {/* 2. Environment Selector */}
        <div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
            <Shirt className="h-4 w-4 text-emerald-400" />
            <span>2. Πού βρίσκεσαι τώρα;</span>
          </span>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
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
                className={`flex min-h-[46px] w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition active:scale-[0.99] ${
                  checkIn.environment === env
                    ? 'border border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                    : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span>{ENVIRONMENT_LABELS_GREEK[env]}</span>
                {checkIn.environment === env && (
                  <span className="ml-2 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Mood & Energy */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-zinc-100">
                <Smile className="h-4 w-4 text-emerald-400" />
                Διάθεση
              </span>
              <span className="font-semibold text-emerald-400">
                {checkIn.mood}/5 • {MOOD_LABELS[checkIn.mood]}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as MoodScore[]).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateCheckInField('mood', val)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition ${
                    checkIn.mood === val
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-zinc-100">
                <Battery className="h-4 w-4 text-emerald-400" />
                Ενέργεια
              </span>
              <span className="font-semibold text-emerald-400">
                {checkIn.energy}/5 • {ENERGY_LABELS[checkIn.energy]}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as EnergyScore[]).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateCheckInField('energy', val)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition ${
                    checkIn.energy === val
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. Pain Level */}
        <div className="border-t border-zinc-800/80 pt-3">
          <label className="flex items-center justify-between text-xs font-bold text-zinc-200">
            <span className="flex items-center gap-1.5">
              <AlertTriangle
                className={`h-4 w-4 ${
                  checkIn.painLevel >= 4 ? 'text-amber-400' : 'text-zinc-400'
                }`}
              />
              Έχεις κάποιον πόνο σήμερα; (0 = Κανένας)
            </span>
            <span
              className={`rounded-lg px-2.5 py-0.5 font-bold ${
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
              placeholder="Πού νιώθεις ενόχληση; (π.χ. γόνατο, μέση, αστράγαλος)"
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          )}
        </div>
      </section>

      {/* PROMINENT PRIMARY RECOMMENDATION CARD ("Το Επόμενο Βήμα") */}
      <section
        aria-label="Το Επόμενο Βήμα"
        className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/45 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">
            <Footprints className="h-3.5 w-3.5" />
            {MODALITY_LABELS_GREEK[displayedPrescription.modality]}
          </span>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-extrabold text-zinc-950">
              <Clock className="h-3.5 w-3.5" />
              {displayedPrescription.durationMins} λεπτά
            </span>
          </div>
        </div>

        <h2 className="mt-3 text-xl font-bold leading-snug text-zinc-50">
          {displayedPrescription.title}
        </h2>

        <p className="mt-1 text-xs font-semibold text-emerald-400">
          {displayedPrescription.intensityLabel} • Κανένας Εξοπλισμός
        </p>

        {/* 1. WHAT WE ACHIEVE IN THE BODY (Τι πετυχαίνουμε) */}
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <Target className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>Τι πετυχαίνουμε στο σώμα:</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-100">
            {displayedPrescription.whatWeAchieveGreek}
          </p>
        </div>

        {/* 2. EXACT STEP-BY-STEP INSTRUCTIONS (Τι κάνω ακριβώς βήμα-βήμα) */}
        <div className="mt-3.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
            <ListChecks className="h-4 w-4 shrink-0" />
            <span>Τι κάνω ακριβώς (Βήμα-Βήμα):</span>
          </div>
          <ol className="mt-2.5 space-y-2.5 text-sm leading-relaxed text-zinc-100">
            {displayedPrescription.stepByStepGreek.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  {idx + 1}
                </span>
                <span>{step.replace(/^Βήμα\s*\d+\s*[:(-]?\s*/i, '')}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* 3. Plain-Greek Reasoning Box */}
        <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Γιατί προτείνεται αυτό σήμερα</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">
            {displayedPrescription.reasoningGreek}
          </p>
        </div>

        {/* 3-BUTTON FRICTION NEGOTIATOR (Large Mobile Buttons) */}
        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={handleStartPrimary}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/25 transition active:scale-[0.99]"
          >
            <Play className="h-5 w-5 fill-current" />
            Πολύ εύκολη, ξεκινάω ({displayedPrescription.durationMins}&apos;)
          </button>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleBoredSwap}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-3 py-3 text-xs font-bold text-zinc-100 transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              <RefreshCw className="h-4 w-4 text-amber-400" />
              Μπορώ, αλλά βαριέμαι (Άλλαξέ το)
            </button>

            <button
              type="button"
              onClick={handleHardDowngrade}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-3 py-3 text-xs font-bold text-zinc-100 transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              <TrendingDown className="h-4 w-4 text-emerald-400" />
              Σήμερα δυσκολεύομαι πολύ (2&apos;)
            </button>
          </div>
        </div>
      </section>

      {/* RICH EQUIPMENT-FREE WORKOUT LIBRARY (15 Programs for Ages 5-105) */}
      <section
        aria-label="Βιβλιοθήκη Ασκήσεων Χωρίς Εξοπλισμό"
        className="space-y-3.5 rounded-2xl border border-zinc-800/90 bg-zinc-900/90 p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-emerald-400">
              <Home className="h-4 w-4" />
              <h3 className="text-sm font-bold text-zinc-100">
                Έτοιμα Προγράμματα Σπιτιού & Γραφείου ({HOME_WORKOUT_PROTOCOLS.length})
              </h3>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              100% χωρίς κανέναν εξοπλισμό. Απλές, κατανοητές κινήσεις για κάθε ηλικία.
            </p>
          </div>
          <Dumbbell className="h-5 w-5 shrink-0 text-emerald-400" />
        </div>

        {/* Horizontal Scrollable Category Filter Pills */}
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setSelectedHomeCategory('all')}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              selectedHomeCategory === 'all'
                ? 'bg-emerald-500 text-zinc-950'
                : 'border border-zinc-800 bg-zinc-950 text-zinc-300'
            }`}
          >
            Όλα ({HOME_WORKOUT_PROTOCOLS.length})
          </button>
          {(Object.keys(HOME_WORKOUT_CATEGORY_LABELS) as HomeWorkoutCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedHomeCategory(cat)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                selectedHomeCategory === cat
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-300'
              }`}
            >
              {HOME_WORKOUT_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Clean Expandable Cards for Mobile */}
        <div className="space-y-2.5 pt-1">
          {filteredHomeWorkouts.map((proto) => {
            const isExpanded = expandedProtocolId === proto.id;

            return (
              <div
                key={proto.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-emerald-500/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      {proto.categoryLabelGreek} • {proto.equipmentGreek}
                    </span>
                    <h4 className="mt-1.5 text-sm font-bold leading-snug text-zinc-100">
                      {proto.titleGreek}
                    </h4>
                  </div>
                  <span className="shrink-0 rounded-xl bg-zinc-900 px-2.5 py-1 text-xs font-extrabold text-emerald-400">
                    {proto.durationMins}&apos;
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                  <strong className="text-emerald-400">Τι πετυχαίνουμε: </strong>
                  {proto.whatWeAchieveGreek}
                </p>

                {isExpanded && (
                  <ol className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3 text-xs leading-relaxed text-zinc-200">
                    {proto.exercisesGreek.map((ex, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                          {i + 1}
                        </span>
                        <span>{ex.replace(/^Βήμα\s*\d+\s*[:(-]?\s*/i, '')}</span>
                      </li>
                    ))}
                  </ol>
                )}

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedProtocolId(isExpanded ? null : proto.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Κλείσιμο βημάτων
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Δες τα βήματα ({proto.exercisesGreek.length})
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectHomeProtocol(proto)}
                      className="min-h-[38px] rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
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
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/15"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Έναρξη ({proto.durationMins}&apos;)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
