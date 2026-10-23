'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  Dumbbell,
  Footprints,
  Laptop,
  ListChecks,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
  Target,
  TrendingDown,
  Utensils,
  Watch,
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
  MovementLog,
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
  LIFE_SCENARIO_PRESETS,
  LifeScenarioPreset,
  SCENARIO_ATTIRE_LABELS,
  SCENARIO_EMOTION_LABELS,
  SCENARIO_PLACE_LABELS,
  ScenarioAttireTag,
  ScenarioEmotionTag,
  ScenarioPlaceTag,
} from '@/lib/engine/homeWorkouts';
import {
  calculateAthleticMachineProgress,
  DEFAULT_TRANSFORMATION_GOAL,
  getDailyNutritionAndMotivation,
  PersonalTransformationGoal,
  UploadedDietPlan,
} from '@/lib/engine/nutritionAndMotivation';
import {
  DEFAULT_BIOMARKERS,
  DEFAULT_BIOMETRICS,
  DEFAULT_CHECK_IN,
  DEFAULT_PROGRESSION,
  getKinesisSnapshot,
  getTransformationGoal,
  getUploadedDietPlan,
  recordMovementLog,
  recordRejection,
  saveBiometrics,
  saveCheckIn,
  saveTransformationGoal,
  saveUploadedDietPlan,
} from '@/lib/storage/db';
import {
  getPersonalSyncKey,
  pairAndMergeWithDevice,
  pullProgressFromCloud,
  pushProgressToCloud,
} from '@/lib/storage/cloudSync';
import { PdfExtractionResult } from '@/lib/parser/pdfBiomarkerExtractor';
import { SmartwatchSyncResult } from '@/lib/parser/smartwatchParser';
import SessionTimer, {
  ACTIVE_TIMER_STORAGE_KEY,
  ActiveTimerSession,
  PersistedTimerState,
} from '@/components/SessionTimer';
import GoalAndNutritionHub from '@/components/GoalAndNutritionHub';

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
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [rejections, setRejections] = useState<RejectionEvent[]>([]);
  const [checkIn, setCheckIn] = useState<CheckInInput>(DEFAULT_CHECK_IN);
  const [goal, setGoal] = useState<PersonalTransformationGoal>(DEFAULT_TRANSFORMATION_GOAL);
  const [dietPlan, setDietPlan] = useState<UploadedDietPlan | null>(null);
  const [pdfHistory, setPdfHistory] = useState<PdfExtractionResult[]>([]);
  const [watchHistory, setWatchHistory] = useState<SmartwatchSyncResult[]>([]);
  const [syncKey, setSyncKey] = useState<string>('');
  const [quickPairInput, setQuickPairInput] = useState<string>('');
  const [isCheckingEcosystem, setIsCheckingEcosystem] = useState<boolean>(false);
  const [ecosystemReport, setEcosystemReport] = useState<{
    type: 'success' | 'error';
    title: string;
    bullets: string[];
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [overridePrescription, setOverridePrescription] = useState<{
    prescription: AlternativePrescription & {
      specialistBadgeGreek?: string;
      physiologyAndOrthopedicsGreek?: string;
    };
    mode: 'bored_swap' | 'micro_step';
  } | null>(null);

  const [boredCycleIndex, setBoredCycleIndex] = useState<number>(0);
  const [selectedHomeCategory, setSelectedHomeCategory] = useState<HomeWorkoutCategory | 'all'>(
    'all'
  );
  const [selectedPlace, setSelectedPlace] = useState<ScenarioPlaceTag | 'all'>('all');
  const [selectedEmotion, setSelectedEmotion] = useState<ScenarioEmotionTag | 'all'>('all');
  const [selectedAttire, setSelectedAttire] = useState<ScenarioAttireTag | 'all'>('all');
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showScenarioFilters, setShowScenarioFilters] = useState<boolean>(false);
  const [expandedProtocolId, setExpandedProtocolId] = useState<string | null>(
    HOME_WORKOUT_PROTOCOLS[0]?.id ?? null
  );

  const [activeTimer, setActiveTimer] = useState<ActiveTimerSession | null>(null);
  const [completionBanner, setCompletionBanner] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [snap, loadedGoal, loadedDiet] = await Promise.all([
      getKinesisSnapshot(),
      getTransformationGoal(),
      getUploadedDietPlan(),
    ]);
    setProgression(snap.progression);
    setBiometrics(snap.biometrics);
    setBiomarkers(snap.biomarkers);
    setLogs(snap.logs);
    setRejections(snap.rejections);
    setGoal(loadedGoal);
    setDietPlan(loadedDiet);
    setPdfHistory((snap.pdfHistory as PdfExtractionResult[] | undefined) ?? []);
    setWatchHistory((snap.smartwatchHistory as SmartwatchSyncResult[] | undefined) ?? []);
    setSyncKey(getPersonalSyncKey());
    if (snap.progression.lastCheckIn) {
      setCheckIn(snap.progression.lastCheckIn);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
    try {
      const savedTimerRaw = window.localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY);
      if (savedTimerRaw) {
        const parsed = JSON.parse(savedTimerRaw) as PersistedTimerState;
        if (parsed && parsed.session && parsed.session.title) {
          setActiveTimer(parsed.session);
        }
      }
    } catch {
      // ignore
    }
    const handleSyncRestored = () => {
      loadData();
    };
    window.addEventListener('kinesis-sync-restored', handleSyncRestored);
    return () => {
      window.removeEventListener('kinesis-sync-restored', handleSyncRestored);
    };
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
        specialistBadgeGreek: overridePrescription.prescription.specialistBadgeGreek,
        physiologyAndOrthopedicsGreek:
          overridePrescription.prescription.physiologyAndOrthopedicsGreek,
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
        specialistBadgeGreek: undefined as string | undefined,
        physiologyAndOrthopedicsGreek: undefined as string | undefined,
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
        reasoningGreek: `Επιλέχθηκε εξειδικευμένο πρωτόκολλο (${protocol.specialistBadgeGreek || protocol.categoryLabelGreek}) 100% χωρίς εξοπλισμό.`,
        whatWeAchieveGreek: protocol.whatWeAchieveGreek,
        stepByStepGreek: protocol.exercisesGreek,
        habitPointsAward: protocol.habitPointsAward,
        structuralPointsAward: protocol.structuralPointsAward,
        specialistBadgeGreek: protocol.specialistBadgeGreek || protocol.categoryLabelGreek,
        physiologyAndOrthopedicsGreek: protocol.physiologyAndOrthopedicsGreek,
      },
      mode: 'bored_swap',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyLifeScenario = async (scenario: LifeScenarioPreset) => {
    setCompletionBanner(null);
    setActiveScenarioId(scenario.id);
    const nextCheckIn: CheckInInput = {
      ...checkIn,
      environment: scenario.checkInPatch.environment,
      mood: scenario.checkInPatch.mood,
      energy: scenario.checkInPatch.energy,
      timeWindowMins: scenario.checkInPatch.timeWindowMins,
      painLevel: scenario.checkInPatch.painLevel ?? checkIn.painLevel,
    };
    setCheckIn(nextCheckIn);
    await saveCheckIn(nextCheckIn);

    const matchedProto =
      HOME_WORKOUT_PROTOCOLS.find((p) => p.id === scenario.recommendedProtocolId) ??
      HOME_WORKOUT_PROTOCOLS[0];

    setOverridePrescription({
      prescription: {
        id: matchedProto.id,
        title: matchedProto.titleGreek,
        modality: matchedProto.modality,
        durationMins: matchedProto.durationMins,
        intensityLabel: `${matchedProto.intensityLabel} • ${scenario.attireLabelGreek}`,
        reasoningGreek: `Ενεργοποιήθηκε το 1-Click Σενάριο «${scenario.titleGreek}» (${scenario.placeLabelGreek} • ${scenario.emotionLabelGreek} • ${scenario.specialistLabelGreek}).`,
        whatWeAchieveGreek: matchedProto.whatWeAchieveGreek,
        stepByStepGreek: matchedProto.exercisesGreek,
        habitPointsAward: matchedProto.habitPointsAward,
        structuralPointsAward: matchedProto.structuralPointsAward,
        specialistBadgeGreek: matchedProto.specialistBadgeGreek || scenario.specialistLabelGreek,
        physiologyAndOrthopedicsGreek: matchedProto.physiologyAndOrthopedicsGreek,
      },
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
    setLogs((prev) => [result.log, ...prev]);
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

  const machineStatus = useMemo(
    () => calculateAthleticMachineProgress(progression, biometrics, logs, goal),
    [progression, biometrics, logs, goal]
  );

  const dailyNutrition = useMemo(
    () =>
      getDailyNutritionAndMotivation(
        progression.currentStage,
        checkIn,
        biometrics,
        biomarkers,
        0
      ),
    [progression.currentStage, checkIn, biometrics, biomarkers]
  );

  const handleRunEcosystemCheck = async () => {
    setIsCheckingEcosystem(true);
    setEcosystemReport(null);
    const activeKey = getPersonalSyncKey();
    setSyncKey(activeKey);

    try {
      const pullRes = await pullProgressFromCloud(activeKey, { forceMerge: true });
      const pushRes = await pushProgressToCloud(activeKey);
      await loadData();
      const freshSnap = await getKinesisSnapshot();

      const pdfCount = freshSnap.pdfHistory?.length ?? 0;
      const watchCount = freshSnap.smartwatchHistory?.length ?? 0;
      const logsCount = freshSnap.logs?.length ?? 0;
      const recNow = calculateRecommendation(
        freshSnap.progression.lastCheckIn ?? checkIn,
        freshSnap.progression.currentStage,
        freshSnap.biometrics,
        freshSnap.biomarkers,
        freshSnap.rejections
      );

      setIsCheckingEcosystem(false);
      if (pushRes.ok) {
        setEcosystemReport({
          type: 'success',
          title: `Όλα τα υποσυστήματα επικοινωνούν κανονικά (Κωδικός Συγχρονισμού: ${activeKey})!`,
          bullets: [
            `1. Γέφυρα Κινητού ↔ Υπολογιστή: Ενεργή στον κωδικό ${activeKey} (${pullRes.found ? 'Ενώθηκαν αυτόματα τα δεδομένα Κινητού & PC' : 'Το πλήρες αντίγραφο ανέβηκε στο Cloud και είναι έτοιμο για την άλλη συσκευή'}).`,
            `2. Αιματολογικές Εξετάσεις (PDF) → Μηχανή & Διατροφή: ${pdfCount} αρχεία PDF ενεργά (Φερριτίνη: ${freshSnap.biomarkers.ferritin ?? '—'} ng/mL, Αιμοσφαιρίνη: ${freshSnap.biomarkers.hemoglobin ?? '—'} g/dL, Βιταμίνη D: ${freshSnap.biomarkers.vitaminD ?? '—'} ng/mL).`,
            `3. Smartwatch & Βιομετρικά → Safety Gate: Ύπνος ${freshSnap.biometrics.sleepScore}/100, Παλμοί Ηρεμίας ${freshSnap.biometrics.rhr} bpm, Βήματα ${freshSnap.biometrics.stepsSoFar} (${watchCount} συγχρονισμοί ρολογιού).`,
            `4. Σημερινό Αποτέλεσμα Ένωσης: Η πρόταση προσαρμόστηκε σε «${recNow.title}» (${recNow.durationMins}') + Διατροφικό Tip «${dailyNutrition.nutritionTitleGreek}» (${logsCount} συνολικές προπονήσεις).`,
          ],
        });
      } else {
        setEcosystemReport({
          type: 'error',
          title: 'Προσοχή στη σύνδεση Cloud',
          bullets: [
            pushRes.error || 'Δεν ολοκληρώθηκε η αποστολή στο Cloud. Δοκίμασε ξανά σε λίγο.',
          ],
        });
      }
    } catch {
      setIsCheckingEcosystem(false);
      setEcosystemReport({
        type: 'error',
        title: 'Σφάλμα κατά τον διαγνωστικό έλεγχο',
        bullets: ['Δοκίμασε ξανά το κουμπί «Έλεγχος Διασύνδεσης & Συγχρονισμός».'],
      });
    }
  };

  const handleQuickPairWithOtherDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = quickPairInput.trim().toUpperCase();
    if (!target) return;

    const currentKey = getPersonalSyncKey();
    if (target === currentKey) {
      setEcosystemReport({
        type: 'error',
        title: `Ο κωδικός ${target} είναι ήδη ο κωδικός ΑΥΤΗΣ της συσκευής!`,
        bullets: [
          `Δεν χρειάζεται να κάνεις σύζευξη της συσκευής με τον εαυτό της.`,
          `Κοίτα πάνω δεξιά στην ΑΛΛΗ σου συσκευή (στο Κινητό ή στον Υπολογιστή) και γράψε εδώ τον κωδικό που δείχνει εκείνη — ή γράψε τον κωδικό ${currentKey} στην άλλη συσκευή!`,
        ],
      });
      return;
    }

    setIsCheckingEcosystem(true);
    setEcosystemReport(null);
    const res = await pairAndMergeWithDevice(target);
    await loadData();
    setIsCheckingEcosystem(false);

    if (res.ok) {
      setSyncKey(res.key);
      setQuickPairInput('');
      window.dispatchEvent(new Event('kinesis-sync-restored'));
      setEcosystemReport({
        type: 'success',
        title: res.messageGreek,
        bullets: [
          `Κοινός Κωδικός Κινητού & Υπολογιστή: ${res.key}`,
          `Αιματολογικές (PDF) που ενώθηκαν: ${res.summary?.pdfCount ?? 0} αρχεία`,
          `Προπονήσεις που ενώθηκαν: ${res.summary?.logsCount ?? 0} • Συγχρονισμοί Smartwatch: ${res.summary?.watchSyncsCount ?? 0}`,
        ],
      });
    } else {
      setEcosystemReport({
        type: 'error',
        title: 'Αδυναμία σύζευξης',
        bullets: [res.messageGreek],
      });
    }
  };

  const filteredHomeWorkouts = useMemo(() => {
    return HOME_WORKOUT_PROTOCOLS.filter((p) => {
      if (selectedHomeCategory !== 'all' && p.category !== selectedHomeCategory) {
        return false;
      }
      if (selectedPlace !== 'all' && p.placeTags && !p.placeTags.includes(selectedPlace)) {
        return false;
      }
      if (selectedEmotion !== 'all' && p.emotionTags && !p.emotionTags.includes(selectedEmotion)) {
        return false;
      }
      if (selectedAttire !== 'all' && p.attireTags && !p.attireTags.includes(selectedAttire)) {
        return false;
      }
      return true;
    });
  }, [selectedHomeCategory, selectedPlace, selectedEmotion, selectedAttire]);

  return (
    <div className="space-y-5">
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

      {/* UNIFIED ECOSYSTEM & LIVE INTERCONNECTIVITY BAR (Binds PDF + Smartwatch + Diet/Goal + Mobile<->PC) */}
      <section
        aria-label="Ζωντανή Διασύνδεση Οικοσυστήματος KINESIS"
        className="rounded-2xl border border-emerald-500/35 bg-zinc-900/95 p-4 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Ζωντανή Διασύνδεση Συστήματος (Οικοσύστημα KINESIS)</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Αιματολογικές (PDF), Smartwatch, Διατροφή & Κινητό ↔ Υπολογιστής τροφοδοτούν μαζί τη
              σημερινή σου άσκηση.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={isCheckingEcosystem}
              onClick={handleRunEcosystemCheck}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-zinc-950 shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingEcosystem ? 'animate-spin' : ''}`} />
              <span>
                {isCheckingEcosystem
                  ? 'Έλεγχος & Συγχρονισμός...'
                  : 'Άμεσος Έλεγχος Διασύνδεσης & Sync'}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Interconnected Pillars Grid */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pillar 1: Blood Test PDFs */}
          <Link
            href="/health"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-emerald-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                <Droplets className="h-3.5 w-3.5 text-emerald-400" />
                1. Αιματολογικές (PDF)
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                {pdfHistory.length} PDF
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
              Φερριτίνη: <strong>{biomarkers.ferritin ?? '—'}</strong> ng/mL • Hb:{' '}
              <strong>{biomarkers.hemoglobin ?? '—'}</strong> • Vit D:{' '}
              <strong>{biomarkers.vitaminD ?? '—'}</strong>
            </p>
            <span className="mt-1.5 text-[10px] font-semibold text-emerald-400 group-hover:underline">
              {biomarkers.ferritin !== null && biomarkers.ferritin < 30
                ? '⚡ Ενεργή προστασία κόπωσης στην άσκηση →'
                : '✓ Τροφοδοτεί άσκηση & διατροφή →'}
            </span>
          </Link>

          {/* Pillar 2: Smartwatch & Biometrics */}
          <Link
            href="/health"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-emerald-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                <Watch className="h-3.5 w-3.5 text-emerald-400" />
                2. Smartwatch & Ύπνος
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                {watchHistory.length > 0 ? `${watchHistory.length} Syncs` : 'Ενεργό'}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
              Ύπνος: <strong>{biometrics.sleepScore}/100</strong> • RHR:{' '}
              <strong>{biometrics.rhr} bpm</strong> • Βήματα:{' '}
              <strong>{biometrics.stepsSoFar}</strong>
            </p>
            <span className="mt-1.5 text-[10px] font-semibold text-emerald-400 group-hover:underline">
              ✓ Ρυθμίζει αυτόματα την ένταση σήμερα →
            </span>
          </Link>

          {/* Pillar 3: Nutrition Tip & Diet Plan */}
          <a
            href="#goal-nutrition-section"
            className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-emerald-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                <Utensils className="h-3.5 w-3.5 text-emerald-400" />
                3. Στόχος & Διατροφή
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                {machineStatus.machineScore}% Μηχανή
              </span>
            </div>
            <p className="mt-1.5 line-clamp-1 text-[11px] text-zinc-300">
              {dietPlan
                ? `Πλάνο: ${dietPlan.fileName} (${dietPlan.meals.length} γεύματα)`
                : `Tip: ${dailyNutrition.nutritionTitleGreek}`}
            </p>
            <span className="mt-1.5 text-[10px] font-semibold text-emerald-400 group-hover:underline">
              ✓ Δες το σημερινό Tip & τον στόχο σου ↓
            </span>
          </a>

          {/* Pillar 4: Mobile <-> PC Pairing (No Self-Pairing!) */}
          <div className="flex flex-col justify-between rounded-xl border border-emerald-500/35 bg-zinc-950 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                <Laptop className="h-3.5 w-3.5 text-emerald-400" />
                4. Κινητό ↔ PC
              </span>
              <span className="font-mono text-[11px] font-extrabold text-emerald-400">
                {syncKey || '...'}
              </span>
            </div>
            <form onSubmit={handleQuickPairWithOtherDevice} className="mt-1.5 flex gap-1">
              <input
                type="text"
                value={quickPairInput}
                onChange={(e) => setQuickPairInput(e.target.value.toUpperCase())}
                placeholder="Κωδικός ΑΛΛΗΣ συσκευής"
                className="w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] font-bold text-emerald-400 placeholder:font-sans placeholder:text-[10px] placeholder:font-normal placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isCheckingEcosystem}
                className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-extrabold text-zinc-950 hover:opacity-95"
              >
                Ένωση
              </button>
            </form>
            <span className="mt-1 text-[10px] text-zinc-400">
              Γράψε τον κωδικό της άλλης συσκευής για ένωση PDF & προόδου.
            </span>
          </div>
        </div>

        {/* Live Ecosystem Diagnostic Report */}
        {ecosystemReport && (
          <div
            className={`mt-3 rounded-xl border p-3.5 text-xs ${
              ecosystemReport.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                {ecosystemReport.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                )}
                <span>{ecosystemReport.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setEcosystemReport(null)}
                className="text-[11px] text-zinc-400 hover:text-zinc-100"
              >
                Κλείσιμο
              </button>
            </div>
            <ul className="mt-2 space-y-1 pl-6 text-[11px] leading-relaxed text-zinc-200">
              {ecosystemReport.bullets.map((b, idx) => (
                <li key={idx} className="list-disc">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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

      {/* 100% RESPONSIVE 12-COLUMN GRID (Single column on Mobile, 2 columns on Desktop) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN (Mobile Top): Stage Status & Quick Check-In Controls */}
        <div className="min-w-0 space-y-4 lg:col-span-5 lg:sticky lg:top-20">
          {/* Top Status Header */}
          <header className="rounded-2xl border border-zinc-800/90 bg-zinc-900/95 p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-400">
                  <Zap className="h-3 w-3" />
                  {currentStageDef.code.replace('STAGE', 'ΣΤΑΔΙΟ')} • {currentStageDef.titleGreek}
                </span>
                <h1 className="mt-1.5 text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
                  Το Επόμενο Βήμα Σου
                </h1>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Μία μόνο ξεκάθαρη κίνηση, κομμένη και ραμμένη στο πώς νιώθεις τώρα.
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-right">
                <span className="block text-[10px] font-medium text-zinc-400">Όρεξη & Ενέργεια</span>
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
            <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-zinc-800/80 pt-3 sm:grid-cols-2">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-zinc-300">Συνήθεια Κίνησης</span>
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
                  <span className="font-medium text-zinc-300">Αντοχή για τα 5km</span>
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

            {/* Mobile Effortless Quick-Jump Bar */}
            <div className="mt-3.5 grid grid-cols-2 gap-1.5 border-t border-zinc-800/80 pt-3 sm:grid-cols-4 lg:hidden">
              <a
                href="#checkin-section"
                className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2 text-center text-[11px] font-bold text-zinc-200 active:scale-95"
              >
                1. Χρόνος & Χώρος
              </a>
              <a
                href="#proposal-section"
                className="flex items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2 py-2 text-center text-[11px] font-bold text-emerald-400 active:scale-95"
              >
                2. Η Άσκησή σου ↓
              </a>
              <a
                href="#goal-nutrition-section"
                className="flex items-center justify-center rounded-xl border border-emerald-500/30 bg-zinc-950 px-2 py-2 text-center text-[11px] font-bold text-emerald-400 active:scale-95"
              >
                3. Στόχος & Διατροφή
              </a>
              <a
                href="#library-section"
                className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2 text-center text-[11px] font-bold text-zinc-200 active:scale-95"
              >
                4. Ειδικοί & Σενάρια
              </a>
            </div>
          </header>

          {/* QUICK CHECK-IN CONTROLS (100% Responsive & Mobile Thumb Friendly) */}
          <section
            id="checkin-section"
            aria-label="Γρήγορη Ρύθμιση Σημερινής Κατάστασης"
            className="scroll-mt-20 space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/95 p-4 shadow-lg"
          >
            {/* 1. Time Window Selector */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  1. Πόσα λεπτά έχεις ελεύθερα τώρα;
                </span>
                <span className="rounded-lg bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                  {checkIn.timeWindowMins} λεπτά
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
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
                <span>2. Πού βρίσκεσαι αυτή τη στιγμή;</span>
              </span>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
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
                        ? 'border border-emerald-500/60 bg-emerald-500/15 text-emerald-300 font-bold'
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

            {/* 4. Pain Level & 1-Click Specialist Clinical Presets */}
            <div className="border-t border-zinc-800/80 pt-3">
              <label className="flex items-center justify-between text-xs font-bold text-zinc-200">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      checkIn.painLevel >= 4 ? 'text-amber-400' : 'text-zinc-400'
                    }`}
                  />
                  4. Νιώθεις κάποιο πιάσιμο ή πόνο; (0 = Κανένας)
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

              {/* 1-Click Clinical Area Chips (Zero Typing Needed!) */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: '✓ Καμία Ενόχληση', pain: 0, loc: '' },
                  { label: '🩺 Μέση / Ισχίο (Φυσίατρος)', pain: 4, loc: 'Μέση & Οσφυϊκή Μοίρα' },
                  { label: '🦵 Γόνατο (Ορθοπεδικός)', pain: 4, loc: 'Γόνατο & Επιγονατίδα' },
                  { label: '💻 Αυχένας / Ώμοι (Φυσίατρος)', pain: 4, loc: 'Αυχένας & Ωμοπλάτη' },
                  { label: '🤲 Πρωινή Ακαμψία (Ρευματολόγος)', pain: 4, loc: 'Πρωινή ακαμψία αρθρώσεων' },
                ].map((chip) => {
                  const isSelected =
                    (chip.pain === 0 && checkIn.painLevel === 0) ||
                    (chip.pain > 0 &&
                      checkIn.painLevel >= 4 &&
                      checkIn.painLocation === chip.loc);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={async () => {
                        const next: CheckInInput = {
                          ...checkIn,
                          painLevel: chip.pain,
                          painLocation: chip.loc,
                        };
                        setCheckIn(next);
                        setOverridePrescription(null);
                        await saveCheckIn(next);
                      }}
                      className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                        isSelected
                          ? chip.pain === 0
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'border border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

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
                  placeholder="Πού νιώθεις ενόχληση; (π.χ. γόνατο, μέση, αυχένας, ακαμψία)"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                />
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Primary Recommendation Card & Equipment-Free Workout Library */}
        <div className="min-w-0 space-y-5 lg:col-span-7">
          {/* PROMINENT PRIMARY RECOMMENDATION CARD ("Το Επόμενο Βήμα") */}
          <section
            id="proposal-section"
            aria-label="Το Επόμενο Βήμα"
            className="scroll-mt-20 relative overflow-hidden rounded-2xl border-2 border-emerald-500/45 bg-zinc-900 p-4 sm:p-6 shadow-2xl"
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

            <h2 className="mt-3 text-xl font-bold leading-snug text-zinc-50 sm:text-2xl">
              {displayedPrescription.title}
            </h2>

            <p className="mt-1 text-xs font-semibold text-emerald-400">
              {displayedPrescription.intensityLabel} • 100% Χωρίς Εξοπλισμό
            </p>

            {displayedPrescription.specialistBadgeGreek && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>{displayedPrescription.specialistBadgeGreek}</span>
              </div>
            )}

            {/* 1. WHAT WE ACHIEVE IN THE BODY (Τι πετυχαίνουμε) */}
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Target className="h-4 w-4 shrink-0" />
                <span>Τι κερδίζει το σώμα σου:</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-100">
                {displayedPrescription.whatWeAchieveGreek}
              </p>
              {displayedPrescription.physiologyAndOrthopedicsGreek && (
                <p className="mt-2 border-t border-emerald-500/20 pt-2 text-xs leading-relaxed text-emerald-200/95">
                  🔬 <strong>{displayedPrescription.physiologyAndOrthopedicsGreek}</strong>
                </p>
              )}
            </div>

            {/* 2. EXACT STEP-BY-STEP INSTRUCTIONS (Τι κάνω ακριβώς βήμα-βήμα) */}
            <div className="mt-3.5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <ListChecks className="h-4 w-4 shrink-0" />
                <span>Τι κάνουμε ακριβώς (Βήμα-Βήμα):</span>
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

            {/* 3-BUTTON FRICTION NEGOTIATOR (Large Touch & Desktop Targets) */}
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={handleStartPrimary}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:opacity-95 active:scale-[0.99]"
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

          {/* MULTIDISCIPLINARY SPECIALIST PROTOCOLS & 1-CLICK LIFE SCENARIO MATRIX */}
          <section
            id="library-section"
            aria-label="Πρωτόκολλα Ειδικών & Σενάρια Ζωής"
            className="scroll-mt-20 space-y-4 rounded-2xl border border-emerald-500/35 bg-zinc-900/95 p-4 sm:p-5 shadow-lg"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                  <Sparkles className="h-3 w-3" />
                  Φυσίατροι • Ορθοπεδικοί • Ρευματολόγοι • Ειδικοί Γυμναστές • Εργοφυσιολογία
                </span>
                <h3 className="mt-1.5 text-sm font-bold text-zinc-100 sm:text-base">
                  Πρωτόκολλα Ειδικών & 1-Click Σενάρια Ζωής ({HOME_WORKOUT_PROTOCOLS.length} Προγράμματα)
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Πάτησε με <strong>1 κλικ</strong> το σενάριο που ταιριάζει στον{' '}
                  <strong>τόπο</strong>, το <strong>συναίσθημα</strong> και την{' '}
                  <strong>ένδυσή</strong> σου αυτή τη στιγμή — ή διάλεξε ειδικότητα!
                </p>
              </div>
              <Dumbbell className="h-5 w-5 shrink-0 text-emerald-400" />
            </div>

            {/* PART 1: 1-CLICK INSTANT LIFE SCENARIOS (Maximum Usability Index!) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-emerald-400">
                  ⚡ 1-Click Έτοιμα Σενάρια (Τόπος × Συναίσθημα × Ένδυση × Ειδικός):
                </span>
                <button
                  type="button"
                  onClick={() => setShowScenarioFilters((prev) => !prev)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                >
                  {showScenarioFilters
                    ? 'Κλείσιμο Φίλτρων Τόπου/Ρούχων'
                    : '🎛️ Συνδυασμός Φίλτρων (Τόπος / Συναίσθημα / Ένδυση)'}
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {LIFE_SCENARIO_PRESETS.map((scen) => {
                  const isActive = activeScenarioId === scen.id;
                  const linkedProto = HOME_WORKOUT_PROTOCOLS.find(
                    (p) => p.id === scen.recommendedProtocolId
                  );
                  return (
                    <div
                      key={scen.id}
                      className={`flex flex-col justify-between rounded-xl border p-3 transition ${
                        isActive
                          ? 'border-emerald-500 bg-emerald-500/15 shadow-md'
                          : 'border-zinc-800/90 bg-zinc-900/80 hover:border-emerald-500/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold leading-snug text-zinc-100">
                            {scen.iconEmoji} {scen.titleGreek}
                          </span>
                          {linkedProto && (
                            <span className="shrink-0 rounded-lg bg-zinc-950 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400">
                              {linkedProto.durationMins}&apos;
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                          {scen.subtitleGreek}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                          <span className="rounded bg-zinc-950 px-1.5 py-0.5 text-emerald-300">
                            {scen.specialistLabelGreek}
                          </span>
                          <span className="rounded bg-zinc-950 px-1.5 py-0.5 text-zinc-300">
                            {scen.placeLabelGreek}
                          </span>
                          <span className="rounded bg-zinc-950 px-1.5 py-0.5 text-zinc-300">
                            {scen.attireLabelGreek}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-zinc-800/70 pt-2">
                        <button
                          type="button"
                          onClick={() => handleApplyLifeScenario(scen)}
                          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:border-emerald-500/50"
                        >
                          Φόρτωση Σεναρίου
                        </button>
                        {linkedProto && (
                          <button
                            type="button"
                            onClick={() => {
                              handleApplyLifeScenario(scen);
                              setActiveTimer({
                                title: linkedProto.titleGreek,
                                modality: linkedProto.modality,
                                durationMins: linkedProto.durationMins,
                                intensityLabel: linkedProto.intensityLabel,
                                habitPointsAward: linkedProto.habitPointsAward,
                                structuralPointsAward: linkedProto.structuralPointsAward,
                                wasNegotiated: 'bored_swap',
                                exercisesGreek: linkedProto.exercisesGreek,
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-extrabold text-zinc-950"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            Άμεση Έναρξη ({linkedProto.durationMins}&apos;)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PART 2: OPTIONAL MULTI-DIMENSIONAL FILTER (Place × Emotion × Attire) */}
            {showScenarioFilters && (
              <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-zinc-950 p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400">
                    Φτιάξε το δικό σου Σενάριο (Επίλεξε Τόπο, Συναίσθημα ή Ένδυση):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlace('all');
                      setSelectedEmotion('all');
                      setSelectedAttire('all');
                      setSelectedHomeCategory('all');
                    }}
                    className="text-[11px] font-semibold text-zinc-400 underline hover:text-emerald-400"
                  >
                    Καθαρισμός Φίλτρων
                  </button>
                </div>

                {/* Place Filter */}
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400">
                    1. Τόπος / Χώρος:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPlace('all')}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        selectedPlace === 'all'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      Όλοι οι Χώροι
                    </button>
                    {(Object.keys(SCENARIO_PLACE_LABELS) as ScenarioPlaceTag[]).map((pl) => (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => setSelectedPlace(pl)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          selectedPlace === pl
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {SCENARIO_PLACE_LABELS[pl]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emotion Filter */}
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400">
                    2. Συναίσθημα / Ψυχολογία:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedEmotion('all')}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        selectedEmotion === 'all'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      Όλα τα Συναισθήματα
                    </button>
                    {(Object.keys(SCENARIO_EMOTION_LABELS) as ScenarioEmotionTag[]).map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setSelectedEmotion(em)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          selectedEmotion === em
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {SCENARIO_EMOTION_LABELS[em]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Attire Filter */}
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400">
                    3. Ένδυση / Παπούτσια:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedAttire('all')}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        selectedAttire === 'all'
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      Όλες οι Ενδύσεις
                    </button>
                    {(Object.keys(SCENARIO_ATTIRE_LABELS) as ScenarioAttireTag[]).map((at) => (
                      <button
                        key={at}
                        type="button"
                        onClick={() => setSelectedAttire(at)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          selectedAttire === at
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {SCENARIO_ATTIRE_LABELS[at]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PART 3: SPECIALIST & CATEGORY FILTER PILLS */}
            <div>
              <span className="mb-1.5 block text-[11px] font-bold text-zinc-400">
                Φίλτρο Ειδικότητας & Κατηγορίας ({filteredHomeWorkouts.length} διαθέσιμα πρωτόκολλα):
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedHomeCategory('all')}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    selectedHomeCategory === 'all'
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  Όλα ({HOME_WORKOUT_PROTOCOLS.length})
                </button>
                {(Object.keys(HOME_WORKOUT_CATEGORY_LABELS) as HomeWorkoutCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedHomeCategory(cat)}
                    className={`rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                      selectedHomeCategory === cat
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {HOME_WORKOUT_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* PART 4: RESPONSIVE SPECIALIST PROTOCOL CARDS GRID */}
            <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
              {filteredHomeWorkouts.map((proto) => {
                const isExpanded = expandedProtocolId === proto.id;

                return (
                  <div
                    key={proto.id}
                    className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-emerald-500/40"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            {proto.specialistBadgeGreek || proto.categoryLabelGreek} •{' '}
                            {proto.equipmentGreek}
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

                      {proto.physiologyAndOrthopedicsGreek && (
                        <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-[11px] leading-relaxed text-zinc-300">
                          🔬{' '}
                          <span className="text-emerald-300 font-semibold">
                            {proto.physiologyAndOrthopedicsGreek}
                          </span>
                        </div>
                      )}

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
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                      <button
                        type="button"
                        onClick={() => setExpandedProtocolId(isExpanded ? null : proto.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Κλείσιμο
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Βήματα ({proto.exercisesGreek.length})
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectHomeProtocol(proto)}
                          className="min-h-[38px] rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
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
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-500/15"
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
        </div>
      </div>

      {/* DAILY NUTRITION TIP, PERSONAL GOAL & DIET PLAN HUB (Couch -> Athletic Machine) */}
      <GoalAndNutritionHub
        progression={progression}
        checkIn={checkIn}
        biometrics={biometrics}
        biomarkers={biomarkers}
        logs={logs}
        goal={goal}
        dietPlan={dietPlan}
        onSaveGoal={async (updatedGoal) => {
          const saved = await saveTransformationGoal(updatedGoal);
          setGoal(saved);
          await pushProgressToCloud(getPersonalSyncKey());
        }}
        onSaveDietPlan={async (newPlan) => {
          const saved = await saveUploadedDietPlan(newPlan);
          setDietPlan(saved);
          if (newPlan?.detectedWeightKg && newPlan.detectedWeightKg > 30) {
            const nextBio = { ...biometrics, weight: newPlan.detectedWeightKg };
            setBiometrics(nextBio);
            await saveBiometrics(nextBio);
          }
          await pushProgressToCloud(getPersonalSyncKey());
        }}
        onTriggerCravingResetWorkout={(session) => {
          setCompletionBanner(null);
          setActiveTimer(session);
        }}
      />

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
