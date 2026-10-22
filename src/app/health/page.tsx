'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Droplets,
  Files,
  FileUp,
  HeartPulse,
  Moon,
  Save,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { BiomarkerProfile, CheckInInput, DailyBiometrics, StageId } from '@/types/kinesis';
import {
  DEFAULT_BIOMARKERS,
  DEFAULT_BIOMETRICS,
  DEFAULT_CHECK_IN,
  getKinesisSnapshot,
  getSmartwatchSyncHistory,
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

export default function HealthBiomarkersHub() {
  const [biometrics, setBiometrics] = useState<DailyBiometrics>(DEFAULT_BIOMETRICS);
  const [biomarkers, setBiomarkers] = useState<BiomarkerProfile>(DEFAULT_BIOMARKERS);
  const [currentStage, setCurrentStage] = useState<StageId>(0);
  const [lastCheckIn, setLastCheckIn] = useState<CheckInInput>(DEFAULT_CHECK_IN);
  const [watchSyncHistory, setWatchSyncHistory] = useState<SmartwatchSyncResult[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [pdfHistory, setPdfHistory] = useState<PdfExtractionResult[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pastedLabText, setPastedLabText] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        getKinesisSnapshot(),
        getUploadedPdfHistory(),
        getSmartwatchSyncHistory(),
      ]).then(([snap, history, watchHist]) => {
        setBiometrics(snap.biometrics);
        setBiomarkers(snap.biomarkers);
        setCurrentStage(snap.progression.currentStage);
        if (snap.progression.lastCheckIn) {
          setLastCheckIn(snap.progression.lastCheckIn);
        }
        setPdfHistory(history);
        setWatchSyncHistory(watchHist);
      });
    };
    load();
    window.addEventListener('kinesis-sync-restored', load);
    return () => window.removeEventListener('kinesis-sync-restored', load);
  }, []);

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

    // Merge all detected biomarkers from oldest to newest so the latest upload wins per marker
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

    const totalDetectedCount = validResults.reduce(
      (acc, r) => acc + r.detectedItems.length,
      0
    );
    setSavedNotice(
      `Αναλύθηκαν ${validResults.length} αρχεία PDF (${totalDetectedCount} δείκτες) και συγχωνεύτηκαν αυτόματα στο προφίλ σου!`
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
  };

  const handleClearAllPdfHistory = async () => {
    setPdfHistory([]);
    await saveUploadedPdfHistory([]);
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
    setSavedNotice('Τα ημερήσια βιομετρικά αποθηκεύτηκαν και ενημέρωσαν το Safety Gate.');
  };

  const handleSaveBiomarkers = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveBiomarkers(biomarkers);
    setSavedNotice('Οι αιματολογικοί δείκτες αποθηκεύτηκαν τοπικά στη συσκευή σου.');
  };

  const parseNullableNumber = (val: string): number | null => {
    if (val.trim() === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };

  const rhrElevated = biometrics.rhr > biometrics.baselineRhr + 5;
  const sleepLow = biometrics.sleepScore < 60;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg">
        <div className="flex items-center gap-2 text-emerald-400">
          <HeartPulse className="h-5 w-5" />
          <h1 className="text-lg font-bold text-zinc-50">Υγεία, Ύπνος & Εξετάσεις Αίματος (PDF)</h1>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Ο ύπνος και οι εξετάσεις σου προστατεύουν αυτόματα το σώμα σου: αν είσαι κουρασμένος ή
          έχεις χαμηλό σίδηρο, η εφαρμογή προτείνει πιο ήπιες κινήσεις.
        </p>
      </header>

      {/* Medical Disclaimer */}
      <section
        aria-label="Ιατρική Αποποίηση Ευθύνης"
        className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
          <Stethoscope className="h-4 w-4 shrink-0" />
          <span>Ιατρική Σημείωση & Αποποίηση Ευθύνης</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-200/90">
          Το KINESIS δεν παρέχει ιατρική διάγνωση ούτε αντικαθιστά τον ιατρό σου. Οι βιοδείκτες
          χρησιμοποιούνται αποκλειστικά για την αυτόματη μείωση του προπονητικού φορτίου όταν ο
          οργανισμός εμφανίζει χαμηλή αποκατάσταση, χαμηλό σίδηρο ή ενδείξεις φλεγμονής.
        </p>
      </section>

      {savedNotice && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* 100% Responsive 2-Column Layout on Desktop, 1-Column on Mobile */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Multi-PDF Lab Extractor & History */}
        <div className="space-y-5 lg:col-span-6">
          {/* MULTI-PDF LAB REPORT SMART EXTRACTOR (100% Local-First) */}
          <section
            aria-label="Αυτόματη Ανάγνωση Πολλαπλών PDF Μικροβιολογικού"
            className="space-y-3.5 rounded-2xl border border-emerald-500/35 bg-zinc-900 p-4 sm:p-5 shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <Sparkles className="h-3 w-3" />
                  Υποστήριξη Πολλαπλών PDF • 100% Τοπικά
                </span>
                <h2 className="mt-1.5 text-sm font-bold text-zinc-100 sm:text-base">
                  Αυτόματη Ανάγνωση & Συγχώνευση Πολλαπλών PDF Εξετάσεων
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Επίλεξε <strong>ένα ή περισσότερα PDF ταυτόχρονα</strong> (π.χ. ξεχωριστό PDF για
                  Γενική Αίματος, ξεχωριστό για Βιοχημικές / Βιταμίνες από myHealth ή διαγνωστικό). Το
                  σύστημα ενώνει αυτόματα όλες τις τιμές!
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
                {showPasteBox ? 'Κλείσιμο επικόλλησης κειμένου' : 'Ή επικόλλησε κείμενο εξετάσεων'}
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
                                    • Κόφτης
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
        </div>

        {/* RIGHT COLUMN: Smartwatch Live Sync, Biometrics & Blood Biomarkers Forms */}
        <div className="space-y-5 lg:col-span-6">
          {/* LIVE SMARTWATCH CONNECTION & DIAGNOSTICS HUB */}
          <SmartwatchSyncHub
            biometrics={biometrics}
            biomarkers={biomarkers}
            currentStage={currentStage}
            lastCheckIn={lastCheckIn}
            syncHistory={watchSyncHistory}
            onApplySmartwatchSync={handleApplySmartwatchSync}
          />

          {/* Daily Smartwatch Biometrics */}
          <form
            onSubmit={handleSaveBiometrics}
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-zinc-100">
                  Σημερινή Ξεκούραση & Ύπνος (Smartwatch)
                </h2>
              </div>
              {(rhrElevated || sleepLow) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                  <ShieldAlert className="h-3 w-3" />
                  Προστασία Σώματος • Ήπιος Ρυθμός
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">Ποιότητα Ύπνου (0-100)</label>
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
                  Αυτόματη προστασία αν είναι κάτω από 60
                </span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Ξεκούραση Καρδιάς (HRV ms)</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={biometrics.hrv}
                  onChange={(e) => setBiometrics({ ...biometrics, hrv: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Μεταβλητότητα Παλμών</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Παλμοί Ηρεμίας Σήμερα (bpm)</label>
                <input
                  type="number"
                  min={35}
                  max={120}
                  value={biometrics.rhr}
                  onChange={(e) => setBiometrics({ ...biometrics, rhr: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  Προστασία αν ανέβουν πάνω από +5 από το κανονικό
                </span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Κανονικοί Παλμοί Ηρεμίας (bpm)</label>
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
                <span className="mt-0.5 block text-[10px] text-zinc-500">Ο συνηθισμένος σου μέσος όρος</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Βήματα Σήμερα</label>
                <input
                  type="number"
                  min={0}
                  max={50000}
                  value={biometrics.stepsSoFar}
                  onChange={(e) =>
                    setBiometrics({ ...biometrics, stepsSoFar: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Βάρος (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min={35}
                  max={250}
                  value={biometrics.weight}
                  onChange={(e) => setBiometrics({ ...biometrics, weight: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
            >
              <Save className="h-4 w-4" />
              Αποθήκευση Βιομετρικών Ημέρας
            </button>
          </form>

          {/* Blood Biomarkers Form */}
          <form
            onSubmit={handleSaveBiomarkers}
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5"
          >
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-zinc-100">
                Αιματολογικοί Δείκτες (Συγχωνευμένο Προφίλ)
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">Φερριτίνη (ng/mL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={biomarkers.ferritin ?? ''}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, ferritin: parseNullableNumber(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &lt; 30</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Αιμοσφαιρίνη (g/dL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={biomarkers.hemoglobin ?? ''}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, hemoglobin: parseNullableNumber(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &lt; 12.5</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Βιταμίνη D (ng/mL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={biomarkers.vitaminD ?? ''}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, vitaminD: parseNullableNumber(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Ειδοποίηση αν &lt; 25</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Βιταμίνη B12 (pg/mL)</label>
                <input
                  type="number"
                  step="1"
                  value={biomarkers.vitaminB12 ?? ''}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, vitaminB12: parseNullableNumber(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Ειδοποίηση αν &lt; 250</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">CRP Φλεγμονή (mg/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={biomarkers.crp ?? ''}
                  onChange={(e) =>
                    setBiomarkers({ ...biomarkers, crp: parseNullableNumber(e.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-zinc-500">Κόφτης αν &gt; 3.0</span>
              </div>

              <div>
                <label className="block text-xs text-zinc-400">Γλυκόζη Νηστείας (mg/dL)</label>
                <input
                  type="number"
                  step="1"
                  value={biomarkers.fastingGlucose ?? ''}
                  onChange={(e) =>
                    setBiomarkers({
                      ...biomarkers,
                      fastingGlucose: parseNullableNumber(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">
                Ιατρικοί Περιορισμοί / Ευαισθησίες Τενόντων & Επιπλέον Δείκτες
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.99]"
            >
              <Activity className="h-4 w-4" />
              Ενημέρωση Προφίλ Αιματολογικών
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
