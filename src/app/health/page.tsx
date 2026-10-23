'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Droplets,
  Edit3,
  Files,
  FileUp,
  HeartPulse,
  RefreshCw,
  RotateCcw,
  Save,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { BiomarkerProfile, CheckInInput, DailyBiometrics, StageId } from '@/types/kinesis';
import {
  DEFAULT_BIOMARKERS,
  DEFAULT_BIOMETRICS,
  DEFAULT_CHECK_IN,
  getKinesisSnapshot,
  getSmartwatchSyncHistory,
  getUploadedDietPlan,
  getUploadedPdfHistory,
  recordMovementLog,
  saveBiomarkers,
  saveBiometrics,
  saveSmartwatchSyncHistory,
  saveUploadedPdfHistory,
} from '@/lib/storage/db';
import {
  createSampleGreekLabPdfBlob,
  extractBiomarkersFromMultipleFiles,
  parseBiomarkersFromText,
  PdfExtractionResult,
} from '@/lib/parser/pdfBiomarkerExtractor';
import { SmartwatchSyncResult } from '@/lib/parser/smartwatchParser';
import SmartwatchSyncHub from '@/components/SmartwatchSyncHub';
import {
  getConnectedCloudDevices,
  getPersonalSyncKey,
  pullProgressFromCloud,
  pushProgressToCloud,
} from '@/lib/storage/cloudSync';
import { calculateRecommendation } from '@/lib/engine/recommender';
import {
  getDailyNutritionAndMotivation,
  UploadedDietPlan,
} from '@/lib/engine/nutritionAndMotivation';

type HealthSubTab = 'all' | 'advisories' | 'wearables' | 'labs_edit' | 'diagnostics';

interface HealthDiagnosticItem {
  id: string;
  title: string;
  status: 'ok' | 'warn';
  detail: string;
}

interface UserHealthAdvisoryCard {
  id: string;
  category: 'biometric' | 'biomarker';
  titleGreek: string;
  currentValueLabel: string;
  referenceRangeGreek: string;
  status: 'optimal' | 'attention' | 'safety_lock' | 'unset';
  statusBadgeGreek: string;
  meaningGreek: string;
  actionImpactGreek: string;
}

export default function HealthBiomarkersHub() {
  const [activeSubTab, setActiveSubTab] = useState<HealthSubTab>('all');
  const [biometrics, setBiometrics] = useState<DailyBiometrics>(DEFAULT_BIOMETRICS);
  const [biomarkers, setBiomarkers] = useState<BiomarkerProfile>(DEFAULT_BIOMARKERS);
  const [currentStage, setCurrentStage] = useState<StageId>(0);
  const [lastCheckIn, setLastCheckIn] = useState<CheckInInput>(DEFAULT_CHECK_IN);
  const [watchSyncHistory, setWatchSyncHistory] = useState<SmartwatchSyncResult[]>([]);
  const [dietPlan, setDietPlan] = useState<UploadedDietPlan | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [pdfHistory, setPdfHistory] = useState<PdfExtractionResult[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pastedLabText, setPastedLabText] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);

  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState<boolean>(false);
  const [healthDiagItems, setHealthDiagItems] = useState<HealthDiagnosticItem[] | null>(null);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const loadHealthState = useCallback(async () => {
    const [snap, history, watchHist, loadedDiet] = await Promise.all([
      getKinesisSnapshot(),
      getUploadedPdfHistory(),
      getSmartwatchSyncHistory(),
      getUploadedDietPlan(),
    ]);
    setBiometrics(snap.biometrics);
    setBiomarkers(snap.biomarkers);
    setCurrentStage(snap.progression.currentStage);
    if (snap.progression.lastCheckIn) {
      setLastCheckIn(snap.progression.lastCheckIn);
    }
    setPdfHistory(history);
    setWatchSyncHistory(watchHist);
    setDietPlan(loadedDiet);
  }, []);

  useEffect(() => {
    loadHealthState();
    window.addEventListener('kinesis-sync-restored', loadHealthState);
    return () => window.removeEventListener('kinesis-sync-restored', loadHealthState);
  }, [loadHealthState]);

  const liveRecommendation = useMemo(
    () => calculateRecommendation(lastCheckIn, currentStage, biometrics, biomarkers, []),
    [lastCheckIn, currentStage, biometrics, biomarkers]
  );

  const liveNutritionTip = useMemo(
    () => getDailyNutritionAndMotivation(currentStage, lastCheckIn, biometrics, biomarkers, 0),
    [currentStage, lastCheckIn, biometrics, biomarkers]
  );

  const rhrElevated = biometrics.rhr > biometrics.baselineRhr + 5;
  const sleepLow = biometrics.sleepScore < 60;

  // Build comprehensive User Health Advisories & Interpretations ("Ενημερώσεις προς τον Χρήστη")
  const userAdvisoryCards = useMemo<UserHealthAdvisoryCard[]>(() => {
    const cards: UserHealthAdvisoryCard[] = [];

    // 1. Sleep Score
    cards.push({
      id: 'sleep',
      category: 'biometric',
      titleGreek: 'Ποιότητα Ύπνου & Νευρικό Σύστημα',
      currentValueLabel: `${biometrics.sleepScore}/100`,
      referenceRangeGreek: 'Στόχος: ≥ 60/100 (Ιδανικό: 75–100)',
      status:
        biometrics.sleepScore < 60
          ? 'safety_lock'
          : biometrics.sleepScore < 72
            ? 'attention'
            : 'optimal',
      statusBadgeGreek:
        biometrics.sleepScore < 60
          ? 'Ενεργός Κόφτης Zone 1'
          : biometrics.sleepScore < 72
            ? 'Μέτρια Ξεκούραση'
            : 'Ιδανική Αποκατάσταση',
      meaningGreek:
        biometrics.sleepScore < 60
          ? 'Ο οργανισμός σου δεν ξεκουράστηκε επαρκώς. Οι τένοντες και το νευρικό σύστημα χρειάζονται προστασία σήμερα.'
          : 'Ο ύπνος σου υποστηρίζει ασφαλή καρδιοαναπνευστική και μυϊκή προσαρμογή.',
      actionImpactGreek:
        biometrics.sleepScore < 60
          ? 'Η εφαρμογή κλειδώνει αυτόματα την ένταση σε Zone 1 (ήπια κίνηση/κινητικότητα) και προτείνει πρωτεΐνη + μαγνήσιο για μείωση βραδινής πείνας.'
          : 'Επιτρέπεται κανονικά η πρόοδος σταδίου χωρίς περιορισμό ύπνου.',
    });

    // 2. Resting Heart Rate (RHR) & HRV
    const rhrDiff = biometrics.rhr - biometrics.baselineRhr;
    cards.push({
      id: 'rhr_hrv',
      category: 'biometric',
      titleGreek: 'Παλμοί Ηρεμίας (RHR) & HRV',
      currentValueLabel: `${biometrics.rhr} bpm (Βάση: ${biometrics.baselineRhr} bpm) • HRV ${biometrics.hrv} ms`,
      referenceRangeGreek: `Όριο Ασφαλείας: έως ${biometrics.baselineRhr + 5} bpm`,
      status: rhrElevated ? 'safety_lock' : rhrDiff >= 3 ? 'attention' : 'optimal',
      statusBadgeGreek: rhrElevated
        ? `Αυξημένοι (+${rhrDiff} bpm)`
        : rhrDiff >= 3
          ? 'Ελαφριά Επιβάρυνση'
          : 'Ξεκούραστη Καρδιά',
      meaningGreek: rhrElevated
        ? `Οι παλμοί ηρεμίας σου είναι +${rhrDiff} bpm πάνω από τη βάση σου (${biometrics.baselineRhr} bpm), ένδειξη στρες, κούρασης ή ελλιπούς ενυδάτωσης.`
        : 'Το αυτόνομο νευρικό σου σύστημα βρίσκεται σε ισορροπία.',
      actionImpactGreek: rhrElevated
        ? 'Αυτόματη ενεργοποίηση Safety Gate: αποφεύγονται τα έντονα διαλλείματα τρεξίματος σήμερα.'
        : 'Η καρδιακή σου ετοιμότητα επιτρέπει πλήρη εκτέλεση του προγράμματος.',
    });

    // 3. Steps & Weight
    cards.push({
      id: 'steps_weight',
      category: 'biometric',
      titleGreek: 'Βήματα Ημέρας & Σωματικό Βάρος',
      currentValueLabel: `${biometrics.stepsSoFar.toLocaleString('el-GR')} βήματα • ${biometrics.weight} kg`,
      referenceRangeGreek: 'Στόχος Κίνησης: 6.000+ βήματα/ημέρα',
      status: biometrics.stepsSoFar >= 6000 ? 'optimal' : 'attention',
      statusBadgeGreek:
        biometrics.stepsSoFar >= 6000 ? 'Ενεργός Μεταβολισμός' : 'Χτίζουμε Κίνηση',
      meaningGreek:
        biometrics.weight >= 85
          ? `Στα ${biometrics.weight} kg προστατεύουμε τα γόνατα και τους αστραγάλους με προοδευτική φόρτιση και μηχανικό κορεσμό στη διατροφή.`
          : 'Η καθημερινή σου κίνηση τροφοδοτεί τον δείκτη Αθλητικής Μηχανής.',
      actionImpactGreek:
        biometrics.stepsSoFar >= 7000
          ? 'Κερδίζεις Bonus συνέπειας! Η εφαρμογή προτείνει αποσυμπίεση ισχίων/γάμπας αντί για περιττή καταπόνηση.'
          : 'Κάθε 2λεπτο ή 5λεπτο που ολοκληρώνεις προσθέτει βήματα και καύση χωρίς πίεση.',
    });

    // 4. Ferritin
    cards.push({
      id: 'ferritin',
      category: 'biomarker',
      titleGreek: 'Φερριτίνη Ορού (Αποθήκες Σιδήρου)',
      currentValueLabel:
        biomarkers.ferritin !== null ? `${biomarkers.ferritin} ng/mL` : 'Δεν καταχωρήθηκε',
      referenceRangeGreek: 'Επιθυμητό για αντοχή: ≥ 30 ng/mL',
      status:
        biomarkers.ferritin === null
          ? 'unset'
          : biomarkers.ferritin < 30
            ? 'safety_lock'
            : biomarkers.ferritin < 45
              ? 'attention'
              : 'optimal',
      statusBadgeGreek:
        biomarkers.ferritin === null
          ? 'Αναμονή PDF / Τιμής'
          : biomarkers.ferritin < 30
            ? 'Χαμηλές Αποθήκες (<30)'
            : 'Επαρκείς Αποθήκες',
      meaningGreek:
        biomarkers.ferritin === null
          ? 'Ανέβασε το PDF εξετάσεων ή συμπλήρωσε τη Φερριτίνη για έλεγχο οξυγόνωσης.'
          : biomarkers.ferritin < 30
            ? 'Η χαμηλή φερριτίνη μειώνει τη μεταφορά οξυγόνου στους μύες και φέρνει εύκολο λαχάνιασμα.'
            : 'Οι αποθήκες σιδήρου σου υποστηρίζουν άνετα την αερόβια βελτίωση.',
      actionImpactGreek:
        biomarkers.ferritin !== null && biomarkers.ferritin < 30
          ? 'Μείωση έντασης σε Zone 1–2 και ενεργοποίηση διατροφικής οδηγίας (Κόκκινο κρέας/όσπρια + Βιταμίνη C).'
          : 'Καμία μείωση έντασης από τον δείκτη φερριτίνης.',
    });

    // 5. Hemoglobin
    cards.push({
      id: 'hemoglobin',
      category: 'biomarker',
      titleGreek: 'Αιμοσφαιρίνη (Hb)',
      currentValueLabel:
        biomarkers.hemoglobin !== null ? `${biomarkers.hemoglobin} g/dL` : 'Δεν καταχωρήθηκε',
      referenceRangeGreek: 'Φυσιολογικό όριο ασφαλείας: ≥ 12.5 g/dL',
      status:
        biomarkers.hemoglobin === null
          ? 'unset'
          : biomarkers.hemoglobin < 12.5
            ? 'safety_lock'
            : 'optimal',
      statusBadgeGreek:
        biomarkers.hemoglobin === null
          ? 'Αναμονή PDF / Τιμής'
          : biomarkers.hemoglobin < 12.5
            ? 'Κόφτης Οξυγόνωσης (<12.5)'
            : 'Φυσιολογική Τιμή',
      meaningGreek:
        biomarkers.hemoglobin !== null && biomarkers.hemoglobin < 12.5
          ? 'Η αιμοσφαιρίνη είναι κάτω από 12.5 g/dL, άρα η καρδιά δουλεύει πιο έντονα για την ίδια προσπάθεια.'
          : 'Η μεταφορά οξυγόνου στο αίμα λειτουργεί κανονικά.',
      actionImpactGreek:
        biomarkers.hemoglobin !== null && biomarkers.hemoglobin < 12.5
          ? 'Κλείδωμα έντασης σε ήπιο ρυθμό αναπνοής (Zone 1) ώστε να μην νιώσεις εξάντληση.'
          : 'Πλήρης υποστήριξη αερόβιας προπόνησης.',
    });

    // 6. Vitamin D & B12
    const vitDLow = biomarkers.vitaminD !== null && biomarkers.vitaminD < 25;
    const vitB12Low = biomarkers.vitaminB12 !== null && biomarkers.vitaminB12 < 250;
    cards.push({
      id: 'vitamins',
      category: 'biomarker',
      titleGreek: 'Βιταμίνη D & Βιταμίνη B12',
      currentValueLabel: `Vit D: ${biomarkers.vitaminD ?? '—'} ng/mL • B12: ${biomarkers.vitaminB12 ?? '—'} pg/mL`,
      referenceRangeGreek: 'Στόχος: Vit D ≥ 25 ng/mL • B12 ≥ 250 pg/mL',
      status:
        biomarkers.vitaminD === null && biomarkers.vitaminB12 === null
          ? 'unset'
          : vitDLow || vitB12Low
            ? 'attention'
            : 'optimal',
      statusBadgeGreek:
        biomarkers.vitaminD === null && biomarkers.vitaminB12 === null
          ? 'Αναμονή PDF / Τιμής'
          : vitDLow || vitB12Low
            ? 'Χρειάζεται Ενίσχυση'
            : 'Επαρκή Επίπεδα',
      meaningGreek:
        vitDLow || vitB12Low
          ? 'Χαμηλή Βιταμίνη D ή B12 επηρεάζει την οστική/μυϊκή αποκατάσταση και την καθημερινή ενέργεια.'
          : 'Τα επίπεδα βιταμινών D και B12 στηρίζουν το νευρομυϊκό σύστημα.',
      actionImpactGreek: vitDLow
        ? 'Προτεραιότητα σε ήπια κίνηση σε φυσικό φως και ασκήσεις ενδυνάμωσης τενόντων.'
        : 'Ομαλή υποστήριξη μυών και οστών.',
    });

    // 7. CRP & Fasting Glucose
    const crpHigh = biomarkers.crp !== null && biomarkers.crp > 3.0;
    const glucoseElevated = biomarkers.fastingGlucose !== null && biomarkers.fastingGlucose >= 100;
    cards.push({
      id: 'crp_glucose',
      category: 'biomarker',
      titleGreek: 'CRP Φλεγμονή & Γλυκόζη Νηστείας',
      currentValueLabel: `CRP: ${biomarkers.crp ?? '—'} mg/L • Γλυκόζη: ${biomarkers.fastingGlucose ?? '—'} mg/dL`,
      referenceRangeGreek: 'Στόχος: CRP ≤ 3.0 mg/L • Γλυκόζη 70–99 mg/dL',
      status:
        biomarkers.crp === null && biomarkers.fastingGlucose === null
          ? 'unset'
          : crpHigh
            ? 'safety_lock'
            : glucoseElevated
              ? 'attention'
              : 'optimal',
      statusBadgeGreek: crpHigh
        ? 'Ενεργός Κόφτης Φλεγμονής'
        : glucoseElevated
          ? 'Έμφαση σε Κίνηση μετά το Γεύμα'
          : 'Ισορροπημένο Προφίλ',
      meaningGreek: crpHigh
        ? 'Αυξημένη CRP (>3.0 mg/L) δείχνει συστηματική φλεγμονή ή καταπόνηση.'
        : glucoseElevated
          ? 'Η πρωινή γλυκόζη ωφελείται άμεσα από 5–10 λεπτά περπάτημα μετά το κυρίως γεύμα και από μηχανικό κορεσμό (σαλάτα πριν το άμυλο).'
          : 'Χαμηλή φλεγμονή και σταθερή γλυκόζη.',
      actionImpactGreek: crpHigh
        ? 'Αυτόματη μετατροπή προπόνησης σε αντιφλεγμονώδη κινητικότητα χαμηλής πρόσκρουσης.'
        : 'Ενθάρρυνση σταθερής αερόβιας κίνησης για βέλτιστη ευαισθησία ινσουλίνης.',
    });

    return cards;
  }, [biometrics, biomarkers, rhrElevated]);

  const handleApplySmartwatchSync = async (
    result: SmartwatchSyncResult,
    updatedBiometrics: DailyBiometrics
  ) => {
    setBiometrics(updatedBiometrics);
    await saveBiometrics(updatedBiometrics);

    const nextWatchHistory = [result, ...watchSyncHistory].slice(0, 15);
    setWatchSyncHistory(nextWatchHistory);
    await saveSmartwatchSyncHistory(nextWatchHistory);

    if (result.detectedWorkout) {
      const w = result.detectedWorkout;
      await recordMovementLog({
        title: w.title,
        modality: w.modality,
        durationMins: w.durationMins,
        intensityLabel: `Smartwatch Sync${w.avgHeartRate ? ` • ${w.avgHeartRate} bpm` : ''}`,
        habitPointsEarned: 15,
        structuralPointsEarned: Math.max(4, Math.round(w.durationMins * 0.75)),
        rpe: 5,
        notes: `Αυτόματη εισαγωγή από ${result.sourceName}`,
        wasNegotiated: 'primary',
      });
    }
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);
    setSavedNotice(
      `Τα δεδομένα από «${result.sourceName}» ενημέρωσαν τα βιομετρικά σου και συγχρονίστηκαν στο Cloud (${activeKey})!`
    );
  };

  const mergeAndSavePdfResults = async (newResults: PdfExtractionResult[]) => {
    const validResults = newResults.filter(
      (r) => r.detectedItems.length > 0 || r.extraFindingsGreek.length > 0
    );

    if (validResults.length === 0) {
      setPdfError(
        'Δεν εντοπίστηκαν αναγνωρίσιμες τιμές αιματολογικών στα επιλεγμένα αρχεία. Αν κάποιο PDF είναι σκαναρισμένη εικόνα, δοκίμασε την επικόλληση κειμένου.'
      );
      return;
    }

    setPdfError(null);
    const updatedHistory = [...validResults, ...pdfHistory].slice(0, 15);
    setPdfHistory(updatedHistory);
    await saveUploadedPdfHistory(updatedHistory);

    const mergedProfile: Partial<BiomarkerProfile> = {};
    const extraFindingsSet = new Set<string>();

    for (const item of [...updatedHistory].reverse()) {
      Object.assign(mergedProfile, item.updatedProfile);
      for (const extra of item.extraFindingsGreek) {
        extraFindingsSet.add(extra);
      }
    }

    const extraNotesText = Array.from(extraFindingsSet).join(' • ');
    const nextBiomarkers: BiomarkerProfile = {
      ...biomarkers,
      ...mergedProfile,
      medicalRestrictions: extraNotesText || biomarkers.medicalRestrictions,
    };

    setBiomarkers(nextBiomarkers);
    await saveBiomarkers(nextBiomarkers);
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);

    const totalDetectedCount = validResults.reduce(
      (acc, r) => acc + r.detectedItems.length,
      0
    );
    setSavedNotice(
      `Αναλύθηκαν ${validResults.length} αρχεία PDF (${totalDetectedCount} δείκτες), ενημέρωσαν τις Ενημερώσεις Χρήστη & την πρόταση άσκησης και συγχρονίστηκαν στο Cloud (${activeKey})!`
    );
  };

  const handleMultiPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    setIsParsingPdf(true);
    setPdfError(null);

    try {
      const batchSummary = await extractBiomarkersFromMultipleFiles(filesArray);
      await mergeAndSavePdfResults(batchSummary.resultsPerFile);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'Σφάλμα κατά την ανάγνωση των αρχείων PDF.'
      );
    } finally {
      setIsParsingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleTestMultipleSamplePdfs = async () => {
    setIsParsingPdf(true);
    setPdfError(null);
    try {
      const hemaBlob = createSampleGreekLabPdfBlob('hematology');
      const bioBlob = createSampleGreekLabPdfBlob('biochemistry');

      const file1 = new File([hemaBlob], '1_Γενική_Αίματος_&_Σίδηρος.pdf', {
        type: 'application/pdf',
      });
      const file2 = new File([bioBlob], '2_Βιοχημικές_&_Βιταμίνες_D_B12.pdf', {
        type: 'application/pdf',
      });

      const batchSummary = await extractBiomarkersFromMultipleFiles([file1, file2]);
      await mergeAndSavePdfResults(batchSummary.resultsPerFile);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Σφάλμα δοκιμής πολλαπλών PDF.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleRemovePdfFromHistory = async (id: string) => {
    const nextHistory = pdfHistory.filter((item) => item.id !== id);
    setPdfHistory(nextHistory);
    await saveUploadedPdfHistory(nextHistory);
    await pushProgressToCloud(getPersonalSyncKey());
    setSavedNotice('Το αρχείο PDF αφαιρέθηκε από το ιστορικό.');
  };

  const handleClearAllPdfHistory = async () => {
    setPdfHistory([]);
    await saveUploadedPdfHistory([]);
    await pushProgressToCloud(getPersonalSyncKey());
    setSavedNotice('Καθαρίστηκε η λίστα ανεβασμένων PDF.');
  };

  const handleDownloadSamplePdf = () => {
    const blob = createSampleGreekLabPdfBlob('full');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'KINESIS_Sample_Lab_Results.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleParsePastedText = async () => {
    if (!pastedLabText.trim()) return;
    const result = parseBiomarkersFromText(pastedLabText, 'Επικολλημένο_Κείμενο_Εξετάσεων');
    await mergeAndSavePdfResults([result]);
    setPastedLabText('');
    setShowPasteBox(false);
  };

  const handleSaveBiometrics = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveBiometrics(biometrics);
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);
    setSavedNotice(
      `Τα ημερήσια βιομετρικά αποθηκεύτηκαν, ενημέρωσαν τις Ενημερώσεις Χρήστη & το Safety Gate και συγχρονίστηκαν στο Cloud (${activeKey}).`
    );
  };

  const handleSyncClinicalWeight94 = async () => {
    const targetWeight = dietPlan?.detectedWeightKg ?? 94;
    const nextBio: DailyBiometrics = {
      ...biometrics,
      weight: targetWeight,
    };
    setBiometrics(nextBio);
    await saveBiometrics(nextBio);
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);
    setSavedNotice(
      `Το βάρος συγχρονίστηκε στα ${targetWeight} kg (Κλινικό Πρωτόκολλο Διατροφής) και ανέβηκε στο Cloud (${activeKey}).`
    );
  };

  const handleResetHealthyBiometrics = async () => {
    const nextBio: DailyBiometrics = {
      ...DEFAULT_BIOMETRICS,
      weight: biometrics.weight,
    };
    setBiometrics(nextBio);
    await saveBiometrics(nextBio);
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);
    setSavedNotice('Τα ημερήσια βιομετρικά επαναφέρθηκαν σε ξεκούραστη κατάσταση αναφοράς.');
  };

  const handleSaveBiomarkers = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveBiomarkers(biomarkers);
    const activeKey = getPersonalSyncKey();
    await pushProgressToCloud(activeKey);
    setSavedNotice(
      `Οι αιματολογικοί δείκτες αποθηκεύτηκαν, ενημέρωσαν τις Ενημερώσεις Υγείας και συγχρονίστηκαν στο Cloud (${activeKey}).`
    );
  };

  const handleClearSingleBiomarker = async (
    field: keyof Omit<BiomarkerProfile, 'medicalRestrictions'>
  ) => {
    const next: BiomarkerProfile = {
      ...biomarkers,
      [field]: null,
    };
    setBiomarkers(next);
    await saveBiomarkers(next);
    await pushProgressToCloud(getPersonalSyncKey());
    setSavedNotice('Η τιμή του δείκτη καθαρίστηκε και αποθηκεύτηκε.');
  };

  const handleClearAllBiomarkers = async () => {
    setBiomarkers(DEFAULT_BIOMARKERS);
    await saveBiomarkers(DEFAULT_BIOMARKERS);
    await pushProgressToCloud(getPersonalSyncKey());
    setSavedNotice('Όλοι οι αιματολογικοί δείκτες μηδενίστηκαν.');
  };

  const parseNullableNumber = (val: string): number | null => {
    if (val.trim() === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const handleRunHealthDiagnostics = async () => {
    setIsRunningHealthCheck(true);
    const results: HealthDiagnosticItem[] = [];

    try {
      // 1. PDF & Greek CMap Parser Check
      const sampleBlob = createSampleGreekLabPdfBlob('hematology');
      const batch = await extractBiomarkersFromMultipleFiles([
        new File([sampleBlob], 'Diagnostic_Check.pdf', { type: 'application/pdf' }),
      ]);
      const detectedCount = batch.resultsPerFile[0]?.detectedItems.length ?? 0;
      results.push({
        id: 'pdf_parser',
        title: '1. Μηχανή Ανάγνωσης PDF & Ελληνικών Χαρακτήρων (/ToUnicode CMap)',
        status: detectedCount >= 2 ? 'ok' : 'warn',
        detail:
          detectedCount >= 2
            ? `Επιτυχής ανάγνωση PDF (${detectedCount} δείκτες: Φερριτίνη ${batch.mergedProfile.ferritin} ng/mL, Αιμοσφαιρίνη ${batch.mergedProfile.hemoglobin} g/dL).`
            : 'Προσοχή στην ανάγνωση δοκιμαστικού PDF.',
      });

      // 2. Wearable / Google Health / Smartwatch Check
      results.push({
        id: 'wearables',
        title: '2. Υποσύστημα Google Health Connect, Health Sync & Smartwatch',
        status: 'ok',
        detail: `Ενεργό (${watchSyncHistory.length} καταγεγραμμένοι συγχρονισμοί • Ύπνος ${biometrics.sleepScore}/100 • RHR ${biometrics.rhr} bpm • Βήματα ${biometrics.stepsSoFar}).`,
      });

      // 3. Safety Gate & Recommender Integration
      const rec = calculateRecommendation(lastCheckIn, currentStage, biometrics, biomarkers, []);
      results.push({
        id: 'safety_gate',
        title: '3. Έλεγχος Κόφτη Ασφαλείας (Safety Gate) & Προσαρμογής Άσκησης',
        status: 'ok',
        detail:
          rec.safetyAlertsGreek.length > 0
            ? `Ενεργή προστασία (${rec.safetyAlertsGreek.length} ειδοποιήσεις) → Προσαρμοσμένη πρόταση: «${rec.title}» (${rec.durationMins}', ${rec.intensityLabel}).`
            : `Όλοι οι δείκτες εντός ορίων ασφαλείας → Πρόταση: «${rec.title}» (${rec.durationMins}', ${rec.intensityLabel}).`,
      });

      // 4. Nutrition & Weight Synchronization Check
      results.push({
        id: 'nutrition_bridge',
        title: '4. Γέφυρα Βιοδεικτών ↔ Διατροφής & Βάρους',
        status: 'ok',
        detail: `Τρέχον Βάρος: ${biometrics.weight} kg${dietPlan ? ` • Ενεργό Πλάνο: «${dietPlan.fileName}» (${dietPlan.meals.length} γεύματα)` : ''} • Σημερινό Tip: «${liveNutritionTip.nutritionTitleGreek}».`,
      });

      // 5. Cloud Sync Health Propagation
      const activeKey = getPersonalSyncKey();
      await pullProgressFromCloud(activeKey, { forceMerge: true });
      const pushRes = await pushProgressToCloud(activeKey);
      const devices = getConnectedCloudDevices();
      results.push({
        id: 'cloud_health_sync',
        title: '5. Συγχρονισμός Δεδομένων Υγείας Κινητού ↔ Υπολογιστή',
        status: pushRes.ok ? 'ok' : 'warn',
        detail: pushRes.ok
          ? `Κωδικός ${activeKey} • ${devices.length} συνδεδεμένες συσκευές (${devices.map((d) => d.deviceLabel).join(', ') || 'Αυτή η συσκευή'}).`
          : pushRes.error || 'Τοπική αποθήκευση ενεργή.',
      });
    } catch (err) {
      results.push({
        id: 'error',
        title: 'Σφάλμα Διαγνωστικού Ελέγχου',
        status: 'warn',
        detail: err instanceof Error ? err.message : 'Άγνωστο σφάλμα.',
      });
    } finally {
      setHealthDiagItems(results);
      setIsRunningHealthCheck(false);
    }
  };

  const safetyLockCount = userAdvisoryCards.filter((c) => c.status === 'safety_lock').length;
  const attentionCount = userAdvisoryCards.filter((c) => c.status === 'attention').length;
  const optimalCount = userAdvisoryCards.filter((c) => c.status === 'optimal').length;

  return (
    <div className="space-y-5">
      {/* SPECIALIST HEADER WITH HEALTH SUMMARY & QUICK DIAGNOSTIC BUTTON */}
      <header className="rounded-2xl border border-emerald-500/35 bg-zinc-900 p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
              <HeartPulse className="h-3.5 w-3.5" />
              Κλινικό Κέντρο Υγείας, Βιομετρικών & Ενημερώσεων Χρήστη
            </span>
            <h1 className="mt-1.5 text-lg font-bold text-zinc-50 sm:text-xl">
              Υγεία, Google Health / Smartwatch & Εξετάσεις Αίματος (PDF)
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Πλήρης έλεγχος όλων των λειτουργιών υγείας, άμεση επεξεργασία κάθε δείκτη και
              ξεκάθαρες ενημερώσεις για το πώς το σώμα σου προσαρμόζει τη σημερινή άσκηση και
              διατροφή.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunHealthDiagnostics}
            disabled={isRunningHealthCheck}
            className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-extrabold text-zinc-950 shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
          >
            <ClipboardCheck
              className={`h-4 w-4 ${isRunningHealthCheck ? 'animate-spin' : ''}`}
            />
            <span>
              {isRunningHealthCheck
                ? 'Έλεγχος Υγείας...'
                : 'Έλεγχος Όλων των Λειτουργιών Υγείας'}
            </span>
          </button>
        </div>

        {/* 4 Summary Status Pills */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
            <span className="block text-[10px] font-semibold text-zinc-400">
              Κατάσταση Safety Gate
            </span>
            <span
              className={`mt-0.5 block text-xs font-extrabold ${
                safetyLockCount > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {safetyLockCount > 0
                ? `${safetyLockCount} Ενεργοί Κόφτες Προστασίας`
                : '✓ Πλήρης Ετοιμότητα'}
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
            <span className="block text-[10px] font-semibold text-zinc-400">
              Ύπνος & Καρδιά (RHR)
            </span>
            <span className="mt-0.5 block text-xs font-extrabold text-zinc-100">
              {biometrics.sleepScore}/100 • {biometrics.rhr} bpm
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
            <span className="block text-[10px] font-semibold text-zinc-400">
              Βήματα & Βάρος Σήμερα
            </span>
            <span className="mt-0.5 block text-xs font-extrabold text-emerald-400">
              {biometrics.stepsSoFar.toLocaleString('el-GR')} βήματα • {biometrics.weight} kg
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
            <span className="block text-[10px] font-semibold text-zinc-400">
              Αιματολογικά PDF & Sync
            </span>
            <span className="mt-0.5 block text-xs font-extrabold text-zinc-100">
              {pdfHistory.length} PDF • {watchSyncHistory.length} Watch Syncs
            </span>
          </div>
        </div>

        {/* Sub-Navigation Filter Tabs */}
        <div className="no-scrollbar mt-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {(
            [
              { id: 'all', label: 'Όλα τα Εργαλεία Υγείας' },
              {
                id: 'advisories',
                label: `1. Ενημερώσεις Χρήστη (${optimalCount} Ιδανικά / ${safetyLockCount + attentionCount} Προσοχή)`,
              },
              { id: 'wearables', label: '2. Google Health, Health Sync & Smartwatch' },
              { id: 'labs_edit', label: '3. Αιματολογικές PDF & Επεξεργασία Δεδομένων' },
              { id: 'diagnostics', label: '4. Έλεγχος Λειτουργιών Υγείας' },
            ] as { id: HealthSubTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition ${
                activeSubTab === tab.id
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Medical Disclaimer */}
      <section
        aria-label="Ιατρική Αποποίηση Ευθύνης"
        className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
          <Stethoscope className="h-4 w-4 shrink-0" />
          <span>Ιατρική Σημείωση & Αποποίηση Ευθύνης</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-200/90">
          Το KINESIS δεν παρέχει ιατρική διάγνωση ούτε αντικαθιστά τον ιατρό σου. Οι βιοδείκτες
          χρησιμοποιούνται αποκλειστικά για την αυτόματη μείωση του προπονητικού φορτίου όταν ο
          οργανισμός εμφανίζει χαμηλή αποκατάσταση, χαμηλό σίδηρο ή ενδείξεις φλεγμονής.
        </p>
      </section>

      {savedNotice && (
        <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{savedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedNotice(null)}
            className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 4 (OR TOP WHEN RUN): HEALTH SUBSYSTEMS DIAGNOSTIC SUITE */}
      {(activeSubTab === 'diagnostics' || healthDiagItems !== null) && (
        <section
          aria-label="Έλεγχος Όλων των Λειτουργιών Υγείας"
          className="space-y-3 rounded-2xl border border-emerald-500/40 bg-zinc-900 p-4 sm:p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold text-zinc-100 sm:text-base">
                  Διαγνωστικός Έλεγχος Όλων των Λειτουργιών Υγείας
                </h2>
                <p className="text-xs text-zinc-400">
                  Επαληθεύει σε πραγματικό χρόνο την ανάγνωση PDF, το Google Health / Smartwatch, το
                  Safety Gate και τον συγχρονισμό Cloud.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunHealthDiagnostics}
              disabled={isRunningHealthCheck}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-zinc-950 hover:opacity-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunningHealthCheck ? 'animate-spin' : ''}`} />
              <span>Επανέλεγχος Τώρα</span>
            </button>
          </div>

          {healthDiagItems ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {healthDiagItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 text-xs ${
                    item.status === 'ok'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {item.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                    )}
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-1 pl-6 text-[11px] leading-relaxed text-zinc-200">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
              Πάτησε <strong>«Επανέλεγχος Τώρα»</strong> για να τρέξει ο αυτοματοποιημένος έλεγχος
              των 5 υποσυστημάτων υγείας.
            </div>
          )}
        </section>
      )}

      {/* SECTION 1: SMART USER ADVISORIES & CLINICAL INTERPRETATION HUB ("Ενημερώσεις προς τον Χρήστη") */}
      {(activeSubTab === 'all' || activeSubTab === 'advisories') && (
        <section
          aria-label="Ενημερώσεις & Ερμηνεία Δεικτών προς τον Χρήστη"
          className="space-y-4 rounded-2xl border border-emerald-500/35 bg-zinc-900 p-4 sm:p-5 shadow-lg"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <BellRing className="h-3 w-3" />
                Ζωντανές Ενημερώσεις & Επεξήγηση Δεικτών
              </span>
              <h2 className="mt-1.5 text-sm font-bold text-zinc-100 sm:text-base">
                Τι Σημαίνουν οι Τιμές σου & Πώς Προσαρμόζουν τη Σημερινή σου Μέρα
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Κάθε φορά που ανεβάζεις PDF εξετάσεων, συγχρονίζεις Smartwatch ή αλλάζεις μια τιμή,
                βλέπεις εδώ αναλυτικά τι σημαίνει για το σώμα σου.
              </p>
            </div>
          </div>

          {/* Live Impact Banner: Exercise + Nutrition */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-3.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-400">
                <Activity className="h-4 w-4" />
                <span>Επίδραση στη Σημερινή Άσκηση</span>
              </div>
              <p className="mt-1 text-xs font-bold text-zinc-100">
                {liveRecommendation.title} ({liveRecommendation.durationMins}&apos; •{' '}
                {liveRecommendation.intensityLabel})
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                {liveRecommendation.reasoningGreek}
              </p>
              {liveRecommendation.safetyAlertsGreek.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-[11px] text-amber-300">
                  {liveRecommendation.safetyAlertsGreek.map((al, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>{al}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-3.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-400">
                <Utensils className="h-4 w-4" />
                <span>Επίδραση στη Σημερινή Διατροφή & Ενυδάτωση</span>
              </div>
              <p className="mt-1 text-xs font-bold text-zinc-100">
                {liveNutritionTip.nutritionTitleGreek}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                {liveNutritionTip.nutritionTipGreek}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-emerald-400">
                ✓ {liveNutritionTip.whyItWorksScienceGreek}
              </p>
            </div>
          </div>

          {/* 7 Detailed User Advisory Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {userAdvisoryCards.map((card) => {
              const badgeClasses =
                card.status === 'safety_lock'
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                  : card.status === 'attention'
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                    : card.status === 'optimal'
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400';

              const cardBorder =
                card.status === 'safety_lock'
                  ? 'border-amber-500/45 bg-zinc-950'
                  : card.status === 'attention'
                    ? 'border-amber-500/25 bg-zinc-950'
                    : 'border-zinc-800 bg-zinc-950';

              return (
                <div
                  key={card.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 ${cardBorder}`}
                >
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          {card.category === 'biometric'
                            ? 'Βιομετρικός Δείκτης'
                            : 'Αιματολογικός Δείκτης'}
                        </span>
                        <h3 className="text-xs font-bold text-zinc-100 sm:text-sm">
                          {card.titleGreek}
                        </h3>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${badgeClasses}`}
                      >
                        {card.statusBadgeGreek}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-900 bg-zinc-900/70 px-3 py-1.5">
                      <span className="text-xs font-extrabold text-emerald-400">
                        {card.currentValueLabel}
                      </span>
                      <span className="text-[10px] text-zinc-400">{card.referenceRangeGreek}</span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-zinc-200">
                      <strong className="text-zinc-100">Τι σημαίνει: </strong>
                      {card.meaningGreek}
                    </p>
                  </div>

                  <div className="mt-2.5 border-t border-zinc-900 pt-2 text-[11px] leading-relaxed text-emerald-300/95">
                    <strong>Ρύθμιση KINESIS: </strong>
                    {card.actionImpactGreek}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* MAIN 2-COLUMN WORKSPACE FOR WEARABLES, PDF LABS & DATA EDITING */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Multi-PDF Lab Extractor & Direct Biomarker Data Editing */}
        {(activeSubTab === 'all' || activeSubTab === 'labs_edit') && (
          <div
            className={`space-y-5 ${
              activeSubTab === 'labs_edit' ? 'lg:col-span-12' : 'lg:col-span-6'
            }`}
          >
            {/* MULTI-PDF LAB REPORT SMART EXTRACTOR */}
            <section
              aria-label="Αυτόματη Ανάγνωση Πολλαπλών PDF Μικροβιολογικού"
              className="space-y-3.5 rounded-2xl border border-emerald-500/35 bg-zinc-900 p-4 sm:p-5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <Sparkles className="h-3 w-3" />
                    Υποστήριξη Πολλαπλών PDF & Ελληνικών Γραμματοσειρών
                  </span>
                  <h2 className="mt-1.5 text-sm font-bold text-zinc-100 sm:text-base">
                    Αυτόματη Ανάγνωση & Συγχώνευση PDF Αιματολογικών
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Επίλεξε <strong>ένα ή περισσότερα PDF ταυτόχρονα</strong> (Γενική Αίματος,
                    Βιοχημικές, Βιταμίνες). Το σύστημα αποκωδικοποιεί αυτόματα τις τιμές και
                    ενημερώνει τις κάρτες υγείας σου.
                  </p>
                </div>
                <Files className="h-6 w-6 shrink-0 text-emerald-400" />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]">
                  <FileUp className="h-4 w-4" />
                  {isParsingPdf ? 'Ανάλυση Αρχείων PDF...' : 'Επιλογή 1 ή Πολλαπλών PDF'}
                  <input
                    ref={pdfInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,.pdf,.txt"
                    onChange={handleMultiPdfUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleTestMultipleSamplePdfs}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  Δοκιμή με 2 PDF Ταυτόχρονα
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                <button
                  type="button"
                  onClick={() => setShowPasteBox((p) => !p)}
                  className="underline decoration-zinc-600 hover:text-zinc-200"
                >
                  {showPasteBox
                    ? 'Κλείσιμο επικόλλησης κειμένου'
                    : 'Ή επικόλλησε κείμενο εξετάσεων'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSamplePdf}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Λήψη δείγματος PDF
                </button>
              </div>

              {showPasteBox && (
                <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <textarea
                    rows={3}
                    value={pastedLabText}
                    onChange={(e) => setPastedLabText(e.target.value)}
                    placeholder="π.χ. Φερριτίνη: 22.4 ng/mL, Αιμοσφαιρίνη: 13.8 g/dL, Βιταμίνη D: 24 ng/mL, CRP: 1.2 mg/L..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleParsePastedText}
                    className="w-full rounded-lg bg-emerald-500/20 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Εξαγωγή & Συγχώνευση Τιμών
                  </button>
                </div>
              )}

              {pdfError && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>{pdfError}</span>
                </div>
              )}

              {/* Persistent List of Uploaded PDFs */}
              {pdfHistory.length > 0 && (
                <div className="space-y-2.5 rounded-xl border border-emerald-500/30 bg-zinc-950 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">
                      Ανεβασμένα Αρχεία Εξετάσεων ({pdfHistory.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllPdfHistory}
                      className="text-[11px] text-zinc-400 hover:text-amber-400"
                    >
                      Καθαρισμός λίστας
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {pdfHistory.map((pdf) => (
                      <div
                        key={pdf.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-zinc-100 break-all">{pdf.fileName}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePdfFromHistory(pdf.id)}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                            title="Αφαίρεση αρχείου"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {pdf.detectedItems.length > 0 && (
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {pdf.detectedItems.map((item) => (
                              <div
                                key={item.key}
                                className={`rounded-lg border px-2.5 py-1.5 ${
                                  item.status === 'warning'
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                    : 'border-zinc-800 bg-zinc-950 text-zinc-200'
                                }`}
                              >
                                <div className="text-[10px] text-zinc-400">{item.labelGreek}</div>
                                <div className="font-bold">
                                  {item.value} {item.unit}{' '}
                                  {item.status === 'warning' && (
                                    <span className="text-[10px] font-semibold text-amber-400">
                                      • Προσοχή
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {pdf.extraFindingsGreek.length > 0 && (
                          <div className="mt-2 border-t border-zinc-800/80 pt-1.5 text-[11px] text-zinc-300">
                            <strong className="text-emerald-400">Επιπλέον: </strong>
                            {pdf.extraFindingsGreek.join(' • ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* BLOOD BIOMARKERS INLINE EDITOR WITH FIELD-LEVEL CLEAR CONTROLS */}
            <form
              onSubmit={handleSaveBiomarkers}
              className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-zinc-100">
                    Επεξεργασία Αιματολογικών Δεικτών (Χειροκίνητη Διόρθωση)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClearAllBiomarkers}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-amber-300"
                >
                  <RotateCcw className="h-3 w-3" />
                  Μηδενισμός Δεικτών
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      key: 'ferritin',
                      label: 'Φερριτίνη (ng/mL)',
                      step: '0.1',
                      hint: 'Κόφτης ασφαλείας αν < 30 ng/mL',
                    },
                    {
                      key: 'hemoglobin',
                      label: 'Αιμοσφαιρίνη (g/dL)',
                      step: '0.1',
                      hint: 'Κόφτης ασφαλείας αν < 12.5 g/dL',
                    },
                    {
                      key: 'vitaminD',
                      label: 'Βιταμίνη D (ng/mL)',
                      step: '0.1',
                      hint: 'Ενημέρωση ενίσχυσης αν < 25 ng/mL',
                    },
                    {
                      key: 'vitaminB12',
                      label: 'Βιταμίνη B12 (pg/mL)',
                      step: '1',
                      hint: 'Ενημέρωση ενίσχυσης αν < 250 pg/mL',
                    },
                    {
                      key: 'crp',
                      label: 'CRP Φλεγμονή (mg/L)',
                      step: '0.1',
                      hint: 'Κόφτης ασφαλείας αν > 3.0 mg/L',
                    },
                    {
                      key: 'fastingGlucose',
                      label: 'Γλυκόζη Νηστείας (mg/dL)',
                      step: '1',
                      hint: 'Φυσιολογικό: 70–99 mg/dL',
                    },
                  ] as {
                    key: keyof Omit<BiomarkerProfile, 'medicalRestrictions'>;
                    label: string;
                    step: string;
                    hint: string;
                  }[]
                ).map((item) => (
                  <div key={item.key}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-zinc-300">
                        {item.label}
                      </label>
                      {biomarkers[item.key] !== null && (
                        <button
                          type="button"
                          onClick={() => handleClearSingleBiomarker(item.key)}
                          className="text-[10px] text-zinc-500 hover:text-amber-400"
                          title="Καθαρισμός τιμής"
                        >
                          Καθαρισμός ×
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step={item.step}
                      value={biomarkers[item.key] ?? ''}
                      onChange={(e) =>
                        setBiomarkers({
                          ...biomarkers,
                          [item.key]: parseNullableNumber(e.target.value),
                        })
                      }
                      placeholder="—"
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="mt-0.5 block text-[10px] text-zinc-500">{item.hint}</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300">
                  Ιατρικοί Περιορισμοί / Ευαισθησίες Τενόντων & Επιπλέον Ευρήματα
                </label>
                <input
                  type="text"
                  value={biomarkers.medicalRestrictions}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, medicalRestrictions: e.target.value })
                  }
                  placeholder="π.χ. Ιστορικό τενοντίτιδας Αχιλλείου, ευαισθησία μέσης..."
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
              >
                <Save className="h-4 w-4" />
                Αποθήκευση & Συγχρονισμός Αιματολογικών
              </button>
            </form>
          </div>
        )}

        {/* RIGHT COLUMN: Google Health / Smartwatch Hub & Daily Biometrics Editor */}
        {(activeSubTab === 'all' ||
          activeSubTab === 'wearables' ||
          activeSubTab === 'labs_edit') && (
          <div
            className={`space-y-5 ${
              activeSubTab === 'wearables' ? 'lg:col-span-12' : 'lg:col-span-6'
            }`}
          >
            {/* GOOGLE HEALTH CONNECT, HEALTH SYNC & SMARTWATCH HUB */}
            {(activeSubTab === 'all' || activeSubTab === 'wearables') && (
              <SmartwatchSyncHub
                biometrics={biometrics}
                biomarkers={biomarkers}
                currentStage={currentStage}
                lastCheckIn={lastCheckIn}
                syncHistory={watchSyncHistory}
                onApplySmartwatchSync={handleApplySmartwatchSync}
              />
            )}

            {/* DAILY BIOMETRICS & WEIGHT EDITOR */}
            <form
              onSubmit={handleSaveBiometrics}
              className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-zinc-100">
                    Επεξεργασία Βιομετρικών Ημέρας & Βάρους
                  </h2>
                </div>
                {(rhrElevated || sleepLow) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                    <ShieldAlert className="h-3 w-3" />
                    Προστασία Σώματος • Ήπιος Ρυθμός
                  </span>
                )}
              </div>

              {/* Quick 1-Click Biometric Presets */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSyncClinicalWeight94}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <Scale className="h-3.5 w-3.5" />
                  Συγχρονισμός Βάρους {dietPlan?.detectedWeightKg ?? 94} kg (Κλινικό Πρωτόκολλο)
                </button>

                <button
                  type="button"
                  onClick={handleResetHealthyBiometrics}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Επαναφορά σε Ξεκούραστη Κατάσταση
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Ποιότητα Ύπνου (0-100)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={biometrics.sleepScore}
                    onChange={(e) =>
                      setBiometrics({ ...biometrics, sleepScore: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    Αυτόματη προστασία Zone 1 αν είναι &lt; 60
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Ξεκούραση Καρδιάς (HRV ms)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={biometrics.hrv}
                    onChange={(e) => setBiometrics({ ...biometrics, hrv: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    Μεταβλητότητα Παλμών
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Παλμοί Ηρεμίας Σήμερα (bpm)
                  </label>
                  <input
                    type="number"
                    min={35}
                    max={120}
                    value={biometrics.rhr}
                    onChange={(e) => setBiometrics({ ...biometrics, rhr: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    Προστασία αν ανέβουν πάνω από +5 από τη βάση
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Κανονικοί Παλμοί Ηρεμίας Βάσης (bpm)
                  </label>
                  <input
                    type="number"
                    min={35}
                    max={120}
                    value={biometrics.baselineRhr}
                    onChange={(e) =>
                      setBiometrics({ ...biometrics, baselineRhr: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-0.5 block text-[10px] text-zinc-500">
                    Ο συνηθισμένος σου μέσος όρος
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Βήματα Σήμερα
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60000}
                    value={biometrics.stepsSoFar}
                    onChange={(e) =>
                      setBiometrics({ ...biometrics, stepsSoFar: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Σωματικό Βάρος (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={35}
                    max={250}
                    value={biometrics.weight}
                    onChange={(e) =>
                      setBiometrics({ ...biometrics, weight: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
              >
                <Save className="h-4 w-4" />
                Αποθήκευση & Συγχρονισμός Βιομετρικών
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
