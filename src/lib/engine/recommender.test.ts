import { describe, expect, it } from 'vitest';
import {
  applyMovementToProgression,
  calculateMOS,
  calculateRecommendation,
} from './recommender';
import {
  createSampleGreekLabPdfBlob,
  extractBiomarkersFromMultipleFiles,
  extractTextFromPdfBuffer,
  parseBiomarkersFromText,
} from '@/lib/parser/pdfBiomarkerExtractor';
import { HOME_WORKOUT_PROTOCOLS, LIFE_SCENARIO_PRESETS } from './homeWorkouts';
import {
  createSampleSmartwatchTcx,
  parseSmartwatchRawContent,
} from '@/lib/parser/smartwatchParser';
import {
  calculateAthleticMachineProgress,
  createClinicalSatietyDietPlan,
  createSampleBalancedDietPlan,
  DEFAULT_TRANSFORMATION_GOAL,
  getDailyNutritionAndMotivation,
  isGarbledDietPlan,
  parseDietPlanFromText,
} from './nutritionAndMotivation';
import {
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  KinesisDatabaseDump,
  UserProgressionState,
} from '@/types/kinesis';
import { mergeKinesisSnapshots } from '@/lib/storage/cloudSync';

const healthyBiometrics: DailyBiometrics = {
  rhr: 58,
  baselineRhr: 57,
  hrv: 62,
  sleepScore: 82,
  stepsSoFar: 4200,
  weight: 78,
};

const normalBiomarkers: BiomarkerProfile = {
  ferritin: 65,
  hemoglobin: 14.5,
  vitaminD: 38,
  vitaminB12: 480,
  crp: 0.7,
  fastingGlucose: 88,
  medicalRestrictions: '',
};

const highReadinessCheckIn: CheckInInput = {
  mood: 4,
  energy: 4,
  timeWindowMins: 30,
  environment: 'outdoor',
  painLevel: 0,
  painLocation: '',
};

describe('KINESIS Rules Engine (recommender.ts)', () => {
  describe('1. Safety Gate Priority Pipeline', () => {
    it('hard-locks modality to zero-impact mobility when painLevel >= 4 regardless of high stage or high MOS', () => {
      const painCheckIn: CheckInInput = {
        ...highReadinessCheckIn,
        painLevel: 4,
        painLocation: 'Αχίλλειος τένοντας',
      };

      const rec = calculateRecommendation(
        painCheckIn,
        4,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.modality).toBe('mobility');
      expect(rec.safetyGateTriggered).toBe(true);
      expect(rec.safetyAlertsGreek.some((a) => a.includes('Safety Gate Ενεργό'))).toBe(true);
      expect(rec.safetyAlertsGreek.some((a) => a.includes('Αχίλλειος τένοντας'))).toBe(true);
    });

    it('caps intensity at Zone 1 and avoids high-impact running when sleepScore < 60', () => {
      const poorSleepBiometrics: DailyBiometrics = {
        ...healthyBiometrics,
        sleepScore: 52,
      };

      const rec = calculateRecommendation(
        highReadinessCheckIn,
        4,
        poorSleepBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.intensityLabel).toContain('Zone 1');
      expect(rec.modality).not.toBe('run');
      expect(rec.safetyAlertsGreek.some((a) => a.includes('Ύπνος 52/100'))).toBe(true);
    });

    it('caps intensity at Zone 1 when RHR is elevated above baselineRhr + 5', () => {
      const elevatedRhrBiometrics: DailyBiometrics = {
        ...healthyBiometrics,
        baselineRhr: 56,
        rhr: 64,
      };

      const rec = calculateRecommendation(
        highReadinessCheckIn,
        3,
        elevatedRhrBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.intensityLabel).toContain('Zone 1');
      expect(rec.safetyAlertsGreek.some((a) => a.includes('RHR 64 bpm'))).toBe(true);
    });

    it('dampens intensity and surfaces Greek clinical alerts when ferritin < 30 or CRP > 3', () => {
      const lowIronBiomarkers: BiomarkerProfile = {
        ...normalBiomarkers,
        ferritin: 18,
        crp: 4.2,
      };

      const rec = calculateRecommendation(
        highReadinessCheckIn,
        3,
        healthyBiometrics,
        lowIronBiomarkers,
        []
      );

      expect(rec.intensityLabel).toContain('Zone 1');
      expect(rec.safetyAlertsGreek.some((a) => a.includes('Φερριτίνη'))).toBe(true);
      expect(rec.safetyAlertsGreek.some((a) => a.includes('CRP'))).toBe(true);
    });
  });

  describe('2. Movement Opportunity Score (MOS), Threshold 40 & Strict Time Ceiling', () => {
    it('triggers Zero-Friction Protocol (2-5 mins) when MOS < 40', () => {
      const lowCheckIn: CheckInInput = {
        mood: 1,
        energy: 1,
        timeWindowMins: 5,
        environment: 'indoor_clothes',
        painLevel: 0,
        painLocation: '',
      };

      const mos = calculateMOS(lowCheckIn);
      expect(mos).toBeLessThan(40);

      const rec = calculateRecommendation(
        lowCheckIn,
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.mosScore).toBe(mos);
      expect(rec.zeroFrictionTriggered).toBe(true);
      expect(rec.durationMins).toBeGreaterThanOrEqual(2);
      expect(rec.durationMins).toBeLessThanOrEqual(5);
      expect(rec.habitPointsAward).toBeGreaterThanOrEqual(14);
    });

    it('strictly keeps duration at 2 minutes when timeWindowMins is 2, even when mood=5 and energy=5', () => {
      const twoMinHighMoodCheckIn: CheckInInput = {
        mood: 5,
        energy: 5,
        timeWindowMins: 2,
        environment: 'home_slippers',
        painLevel: 0,
        painLocation: '',
      };

      const rec = calculateRecommendation(
        twoMinHighMoodCheckIn,
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.durationMins).toBe(2);
      expect(rec.boredAlternative.durationMins).toBe(2);
      expect(rec.hardDowngrade.durationMins).toBe(2);
      expect(rec.whatWeAchieveGreek.length).toBeGreaterThan(20);
      expect(rec.stepByStepGreek.length).toBeGreaterThanOrEqual(2);
    });

    it('prescribes full stage-appropriate session when MOS >= 40 and Safety Gate is clear', () => {
      const mos = calculateMOS(highReadinessCheckIn);
      expect(mos).toBeGreaterThanOrEqual(40);

      const rec = calculateRecommendation(
        highReadinessCheckIn,
        3,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.zeroFrictionTriggered).toBe(false);
      expect(rec.modality).toBe('run');
      expect(rec.durationMins).toBe(30);
    });
  });

  describe('3. Behavioral Memory, Rejection Taxonomy & Distinct Environments', () => {
    it('penalizes and swaps out a modality rejected due to boredom', () => {
      const baselineRec = calculateRecommendation(
        highReadinessCheckIn,
        1,
        healthyBiometrics,
        normalBiomarkers,
        []
      );
      expect(baselineRec.modality).toBe('walk');

      const afterBoredomRec = calculateRecommendation(
        highReadinessCheckIn,
        1,
        healthyBiometrics,
        normalBiomarkers,
        [
          { modality: 'walk', reason: 'boredom' },
          { modality: 'walk', reason: 'boredom' },
        ]
      );

      expect(afterBoredomRec.modality).not.toBe('walk');
      expect(afterBoredomRec.reasoningGreek).toContain('Μνήμη Συμπεριφοράς');
    });

    it('differentiates office clothes (standing desk actions) from home slippers (sofa/carpet actions)', () => {
      const officeRec = calculateRecommendation(
        {
          mood: 3,
          energy: 3,
          timeWindowMins: 5,
          environment: 'indoor_clothes',
          painLevel: 0,
          painLocation: '',
        },
        0,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      const homeSlippersRec = calculateRecommendation(
        {
          mood: 3,
          energy: 3,
          timeWindowMins: 5,
          environment: 'home_slippers',
          painLevel: 0,
          painLocation: '',
        },
        0,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(officeRec.title).toContain('Γραφείο');
      expect(homeSlippersRec.title).toContain('Σπίτι');
      expect(officeRec.stepByStepGreek.join(' ')).not.toBe(
        homeSlippersRec.stepByStepGreek.join(' ')
      );
    });
  });

  describe('4. Dual Progression Metrics & Stage Transition', () => {
    it('advances stage when both habitConsistencyScore and runningReadiness cross stage thresholds', () => {
      const initial: UserProgressionState = {
        id: 'singleton',
        currentStage: 0,
        habitConsistencyScore: 40,
        runningReadiness: 12,
        totalSessionsCompleted: 3,
        lastActiveDate: null,
        lastCheckIn: highReadinessCheckIn,
      };

      const { updated, stageAdvanced } = applyMovementToProgression(initial, 12, 6);
      expect(stageAdvanced).toBe(true);
      expect(updated.currentStage).toBe(1);
      expect(updated.habitConsistencyScore).toBe(52);
      expect(updated.runningReadiness).toBe(18);
    });
  });

  describe('5. PDF Microbiological Biomarker Extractor & Home Workouts Catalog', () => {
    it('extracts Greek & English blood biomarkers accurately from a generated PDF binary', async () => {
      const blob = createSampleGreekLabPdfBlob();
      const buffer = await blob.arrayBuffer();
      const text = await extractTextFromPdfBuffer(buffer);
      const parsed = parseBiomarkersFromText(text, 'Sample.pdf');

      expect(parsed.updatedProfile.ferritin).toBe(21.5);
      expect(parsed.updatedProfile.hemoglobin).toBe(13.4);
      expect(parsed.updatedProfile.vitaminD).toBe(22.8);
      expect(parsed.updatedProfile.vitaminB12).toBe(340);
      expect(parsed.updatedProfile.crp).toBe(1.4);
      expect(parsed.updatedProfile.fastingGlucose).toBe(94);
      expect(parsed.extraFindingsGreek.length).toBeGreaterThanOrEqual(2);
    });

    it('merges biomarkers across multiple uploaded PDFs (e.g. separate hematology & biochemistry PDFs)', async () => {
      const hemaBlob = createSampleGreekLabPdfBlob('hematology');
      const bioBlob = createSampleGreekLabPdfBlob('biochemistry');

      const file1 = new File([hemaBlob], '1_Hematology.pdf', { type: 'application/pdf' });
      const file2 = new File([bioBlob], '2_Biochemistry.pdf', { type: 'application/pdf' });

      const batch = await extractBiomarkersFromMultipleFiles([file1, file2]);
      expect(batch.resultsPerFile.length).toBe(2);
      expect(batch.mergedProfile.hemoglobin).toBe(13.4);
      expect(batch.mergedProfile.ferritin).toBe(21.5);
      expect(batch.mergedProfile.vitaminD).toBe(22.8);
      expect(batch.mergedProfile.vitaminB12).toBe(340);
      expect(batch.mergedProfile.crp).toBe(1.4);
      expect(batch.mergedProfile.fastingGlucose).toBe(94);
    });

    it('provides 30 equipment-free home & specialist conditioning protocols with step-by-step Greek exercises', () => {
      expect(HOME_WORKOUT_PROTOCOLS.length).toBe(30);
      for (const proto of HOME_WORKOUT_PROTOCOLS) {
        expect(proto.equipmentGreek).toBe('Κανένας εξοπλισμός');
        expect(proto.exercisesGreek.length).toBeGreaterThan(0);
        expect(proto.whatWeAchieveGreek.length).toBeGreaterThan(10);
        expect(proto.habitPointsAward).toBeGreaterThanOrEqual(14);
      }
    });

    it('parses Smartwatch .TCX XML workouts & morning recovery metrics and exploits them in recommendations', () => {
      const tcxXml = createSampleSmartwatchTcx('walk_run_workout');
      const parsedTcx = parseSmartwatchRawContent(tcxXml, 'Garmin_Workout.tcx');

      expect(parsedTcx.detectedWorkout).toBeDefined();
      expect(parsedTcx.detectedWorkout?.durationMins).toBe(20);
      expect(parsedTcx.detectedWorkout?.distanceMeters).toBe(2450);
      expect(parsedTcx.biometricsUpdate.rhr).toBe(58);
      expect(parsedTcx.biometricsUpdate.stepsSoFar).toBeGreaterThan(3000);

      const highStepBiometrics: DailyBiometrics = {
        ...healthyBiometrics,
        stepsSoFar: 8200,
        hrv: 64,
        sleepScore: 85,
      };
      const rec = calculateRecommendation(
        highReadinessCheckIn,
        2,
        highStepBiometrics,
        normalBiomarkers,
        []
      );
      expect(rec.reasoningGreek).toContain('Smartwatch');
      expect(rec.habitPointsAward).toBeGreaterThanOrEqual(16);
    });

    it('generates adaptive daily nutrition tips, parses personal diet plans, and computes Athletic Machine progress', () => {
      const poorSleepTip = getDailyNutritionAndMotivation(
        0,
        highReadinessCheckIn,
        { ...healthyBiometrics, sleepScore: 50 },
        normalBiomarkers,
        0
      );
      expect(poorSleepTip.id).toBe('tip-sleep-ghrelin');
      expect(poorSleepTip.nutritionTipGreek).toContain('50/100');

      const diet = createSampleBalancedDietPlan();
      expect(diet.meals.length).toBe(5);
      expect(diet.meals[0].slotLabelGreek).toContain('Πρωινό');

      const machine = calculateAthleticMachineProgress(
        {
          id: 'singleton',
          currentStage: 2,
          habitConsistencyScore: 70,
          runningReadiness: 55,
          totalSessionsCompleted: 8,
          lastActiveDate: new Date().toISOString(),
          lastCheckIn: highReadinessCheckIn,
        },
        healthyBiometrics,
        [],
        DEFAULT_TRANSFORMATION_GOAL
      );
      expect(machine.machineScore).toBeGreaterThan(40);
      expect(machine.phaseTitleGreek).toContain('Φάση');
    });

    it('merges Mobile and PC snapshots without losing uploaded PDFs, biomarkers, workouts, smartwatch syncs, or diet plans', () => {
      const pcSnapshot: KinesisDatabaseDump = {
        schemaVersion: '1.1.0',
        exportedAt: '2026-10-23T00:00:00.000Z',
        progression: {
          id: 'singleton',
          currentStage: 1,
          habitConsistencyScore: 48,
          runningReadiness: 22,
          totalSessionsCompleted: 4,
          lastActiveDate: '2026-10-22T18:00:00.000Z',
          lastCheckIn: highReadinessCheckIn,
        },
        biometrics: healthyBiometrics,
        biomarkers: {
          ferritin: null,
          hemoglobin: null,
          vitaminD: null,
          vitaminB12: null,
          crp: null,
          fastingGlucose: null,
          medicalRestrictions: '',
        },
        logs: [
          {
            id: 'pc-log-1',
            timestamp: '2026-10-22T18:00:00.000Z',
            title: '10 Λεπτά Περπάτημα',
            modality: 'walk',
            durationMins: 10,
            intensityLabel: 'Ήπια',
            habitPointsEarned: 15,
            structuralPointsEarned: 5,
            rpe: 3,
            notes: 'PC session',
            wasNegotiated: 'primary',
          },
        ],
        rejections: [],
        pdfHistory: [],
        smartwatchHistory: [],
        uploadedDietPlan: createSampleBalancedDietPlan(),
      };

      const mobileSnapshotWithUploadedPdf: KinesisDatabaseDump = {
        schemaVersion: '1.1.0',
        exportedAt: '2026-10-23T01:00:00.000Z',
        progression: {
          id: 'singleton',
          currentStage: 0,
          habitConsistencyScore: 15,
          runningReadiness: 5,
          totalSessionsCompleted: 1,
          lastActiveDate: '2026-10-23T00:50:00.000Z',
          lastCheckIn: highReadinessCheckIn,
        },
        biometrics: { ...healthyBiometrics, stepsSoFar: 6400 },
        biomarkers: {
          ferritin: 21.5,
          hemoglobin: 13.4,
          vitaminD: 22.8,
          vitaminB12: 340,
          crp: 1.4,
          fastingGlucose: 94,
          medicalRestrictions: 'Χοληστερόλη: 192 mg/dL',
        },
        logs: [
          {
            id: 'mobile-log-1',
            timestamp: '2026-10-23T00:50:00.000Z',
            title: '5 Λεπτά Ξεμπλοκάρισμα Σπιτιού',
            modality: 'mobility',
            durationMins: 5,
            intensityLabel: 'Πολύ Ήπια',
            habitPointsEarned: 15,
            structuralPointsEarned: 3,
            rpe: 2,
            notes: 'Mobile session',
            wasNegotiated: 'primary',
          },
        ],
        rejections: [],
        pdfHistory: [
          {
            id: 'pdf-mobile-1',
            fileName: 'Αιματολογικές_Κινητού.pdf',
            uploadedAt: '2026-10-23T00:55:00.000Z',
            rawSnippet: 'Φερριτίνη 21.5',
            detectedItems: [
              {
                key: 'ferritin',
                labelGreek: 'Φερριτίνη (Ferritin)',
                value: 21.5,
                unit: 'ng/mL',
                status: 'low',
                matchedSnippet: 'Φερριτίνη: 21.5',
              },
            ],
            extraFindingsGreek: ['Χοληστερόλη: 192 mg/dL'],
            updatedProfile: { ferritin: 21.5, hemoglobin: 13.4, vitaminD: 22.8 },
          },
        ],
        smartwatchHistory: [
          {
            id: 'watch-mobile-1',
            sourceName: 'Garmin Mobile Sync',
            syncedAt: '2026-10-23T00:58:00.000Z',
            biometricsUpdate: { stepsSoFar: 6400 },
            summaryGreek: ['Βήματα: 6400'],
          },
        ],
        uploadedDietPlan: null,
      };

      const merged = mergeKinesisSnapshots(pcSnapshot, mobileSnapshotWithUploadedPdf);

      // Preserves Mobile's uploaded PDF & biomarkers AND PC's higher stage, logs, and diet plan!
      expect(merged.pdfHistory?.length).toBe(1);
      expect((merged.pdfHistory?.[0] as { fileName?: string })?.fileName).toBe(
        'Αιματολογικές_Κινητού.pdf'
      );
      expect(merged.biomarkers.ferritin).toBe(21.5);
      expect(merged.biomarkers.hemoglobin).toBe(13.4);
      expect(merged.biomarkers.vitaminD).toBe(22.8);
      expect(merged.progression.currentStage).toBe(1);
      expect(merged.logs.length).toBe(2);
      expect(merged.smartwatchHistory?.length).toBe(1);
      expect(merged.uploadedDietPlan).not.toBeNull();
    });

    it('accurately parses multi-line Clinical Nutrition Protocol (ΚΛΙΝΙΚΟ ΠΡΩΤΟΚΟΛΛΟ ΔΙΑΤΡΟΦΗΣ 94KG) from PDF/pasted text', () => {
      const clinicalText = `ΚΛΙΝΙΚΟ ΠΡΩΤΟΚΟΛΛΟ ΔΙΑΤΡΟΦΗΣ
ΣΤΟΧΟΣ: ΑΠΩΛΕΙΑ ΛΙΠΟΥΣ & ΕΝΕΡΓΕΙΑΚΗ ΣΤΑΘΕΡΟΤΗΤΑ
ΤΡΕΧΟΝ ΒΑΡΟΣ: 94KG | ΕΚΤΙΜΩΜΕΝΟ ΒΑΣΙΚΟ ΙΣΟΖΥΓΙΟ: ~1.950 KCAL | ΣΤΡΑΤΗΓΙΚΗ: ΜΗΧΑΝΙΚΟΣ ΚΟΡΕΣΜΟΣ

1. ΣΤΑΘΕΡΟΣ ΗΜΕΡΗΣΙΟΣ ΚΟΡΜΟΣ (ΚΑΘΗΜΕΡΙΝΑ)
ΠΡΩΙΝΟ
3 φρυγανιές Wasa ή Ολικής Άλεσης
3 φέτες τυρί Adoro light
2 αυγά βραστά (ολόκληρα)
2 ντοματίνια ή μισό αγγούρι

ΣΝΑΚ ΓΡΑΦΕΙΟΥ (ΕΠΙΛΟΓΗ 1 ΑΠΟ ΤΑ 2)
Επιλογή Α: 1 γιαούρτι 2% + 10 αμύγδαλα + 1 μήλο
Επιλογή Β: 2 φρυγανιές ολικής + 2 φέτες γαλοπούλα + 1 αγγούρι

ΒΡΑΔΙΝΟ (2.5 - 3 ΩΡΕΣ ΠΡΙΝ ΤΟΝ ΥΠΝΟ)
200γρ Τυρί Cottage (4% ή light)
Μεγάλη πράσινη σαλάτα
1 κ.σ. ελαιόλαδο (αυστηρά μετρημένο)

2. ΚΥΡΙΩΣ ΓΕΥΜΑ (ΥΨΗΛΟΣ ΠΡΩΤΕΙΝΙΚΟΣ ΟΓΚΟΣ)
Κοτόπουλο / Γαλοπούλα: 200γρ ψητό στήθος + Μεγάλη Σαλάτα
Μοσχάρι Άπαχο: 200γρ ψητό + Σαλάτα + 100γρ καστανό ρύζι
Τόνος (σε νερό): 2 κονσέρβες (στραγγισμένες) + Σαλάτα με ρόκα/μαρούλι

3. ΟΣΠΡΙΑ & ΥΔΑΤΑΝΘΡΑΚΕΣ (1-2 ΦΟΡΕΣ/ΕΒΔΟΜΑΔΑ)
Φακές / Ρεβίθια / Φασόλια: 1 βαθύ πιάτο (στραγγισμένο) + 150γρ Τυρί Cottage.
Ζυμαρικά Ολικής: 1.5 φλιτζάνι βρασμένα + 2 κ.σ. τυρί light + Σαλάτα.
Βιοχημική Οδηγία: Κατανάλωσε ΠΡΩΤΑ τη σαλάτα και την πρωτεΐνη και ΤΕΛΕΥΤΑΙΟ το άμυλο.

4. ΣΤΑΘΕΡΕΣ ΠΑΡΑΜΕΤΡΟΙ (ΜΗ ΔΙΑΠΡΑΓΜΑΤΕΥΣΙΜΕΣ)
3 Λίτρα νερό ημερησίως (Απαραίτητο για τη λιπόλυση στα 94 κιλά).
30-45 λεπτά γρήγορο περπάτημα καθημερινά.`;

      const parsed = parseDietPlanFromText(clinicalText, 'Κλινικό_Πρωτόκολλο_94kg.pdf');

      expect(parsed.detectedWeightKg).toBe(94);
      expect(parsed.meals.length).toBeGreaterThanOrEqual(5);

      const breakfast = parsed.meals.find((m) => m.slotLabelGreek.includes('Πρωινό'));
      expect(breakfast).toBeDefined();
      expect(breakfast?.descriptionGreek).toContain('Adoro light');
      expect(breakfast?.descriptionGreek).toContain('2 αυγά βραστά');

      const snack = parsed.meals.find((m) => m.slotLabelGreek.includes('Σνακ'));
      expect(snack).toBeDefined();
      expect(snack?.descriptionGreek).toContain('Επιλογή Α');
      expect(snack?.descriptionGreek).toContain('Επιλογή Β');

      const lunch = parsed.meals.find((m) => m.slotLabelGreek.includes('Κυρίως'));
      expect(lunch).toBeDefined();
      expect(lunch?.descriptionGreek).toContain('200γρ ψητό στήθος');
      expect(lunch?.descriptionGreek).toContain('Μοσχάρι Άπαχο');

      const dinner = parsed.meals.find((m) => m.slotLabelGreek.includes('Βραδινό'));
      expect(dinner).toBeDefined();
      expect(dinner?.descriptionGreek).toContain('200γρ Τυρί Cottage');

      expect(parsed.parametersGreek?.some((p) => p.includes('3 Λίτρα νερό'))).toBe(true);

      const preset = createClinicalSatietyDietPlan();
      expect(preset.detectedWeightKg).toBe(94);
      expect(preset.meals.length).toBe(5);
    });

    it('parses Google Health Connect / Health Sync JSON payload accurately', () => {
      const jsonStr = createSampleSmartwatchTcx('google_health_sync');
      const res = parseSmartwatchRawContent(jsonStr, 'Google_Health_Connect_Sync.json');

      expect(res.biometricsUpdate.stepsSoFar).toBe(6840);
      expect(res.biometricsUpdate.rhr).toBe(57);
      expect(res.biometricsUpdate.hrv).toBe(61);
      expect(res.biometricsUpdate.sleepScore).toBe(84);
      expect(res.biometricsUpdate.weight).toBe(94);
      expect(res.detectedWorkout).toBeDefined();
      expect(res.detectedWorkout?.durationMins).toBe(18);
    });

    it('decodes the user uploaded WeasyPrint PDF (CIDFont + ToUnicode + OpenType streams) with zero garbled characters and detects/heals garbled plans', async () => {
      const fs = await import('fs');
      const pdfPath =
        'C:/Users/avour/.gemini/antigravity/brain/265e3f91-aa13-4e18-ba5b-c49d25cef7e0/.user_uploaded/media_1792732146488_4df23e41.pdf';

      if (fs.existsSync(pdfPath)) {
        const nodeBuf = fs.readFileSync(pdfPath);
        const ab = nodeBuf.buffer.slice(
          nodeBuf.byteOffset,
          nodeBuf.byteOffset + nodeBuf.byteLength
        );
        const extractedText = await extractTextFromPdfBuffer(ab);

        expect(extractedText).toContain('ΚΛΙΝΙΚΟ ΠΡΩΤΟΚΟΛΛΟ ΔΙΑΤΡΟΦΗΣ');
        expect(extractedText).toContain('ΤΡΕΧΟΝ ΒΑΡΟΣ: 94KG');
        expect(extractedText).not.toContain('endstream');
        expect(extractedText).not.toContain('/Subtype');
        expect(extractedText).not.toContain('\uFFFD');

        const plan = parseDietPlanFromText(extractedText, 'Κλινικό_Πρωτόκολλο.pdf');
        expect(isGarbledDietPlan(plan)).toBe(false);
        expect(plan.detectedWeightKg).toBe(94);
        expect(plan.meals.length).toBe(5);
        expect(plan.meals[0].descriptionGreek).toContain('1 φέτα ψωμί ολικής άλεσης');
        expect(plan.meals[0].descriptionGreek).toContain('1 φέτα τυρί Adoro light');
        expect(plan.meals[0].descriptionGreek).toContain('2 ολόκληρα βραστά αυγά');
        expect(plan.meals[1].descriptionGreek).toContain('1 κεσεδάκι γιαούρτι 2%');
        expect(plan.meals[2].descriptionGreek).toContain('Κοτόπουλο / Κουνέλι');
        expect(plan.meals[2].descriptionGreek).toContain('Μοσχάρι (Άπαχο)');
        expect(plan.meals[2].descriptionGreek).toContain('Τόνος σε Νερό');
        expect(plan.meals[3].descriptionGreek).toContain('Φακές, Μαυρομάτικα, Ρεβίθια');
        expect(plan.meals[3].descriptionGreek).toContain('Πένες Ολικής');
        expect(plan.meals[4].descriptionGreek).toContain('200g τυρί Cottage');
      }

      // Also verify that isGarbledDietPlan catches previously corrupted plans
      const corruptedPlan = {
        ...createClinicalSatietyDietPlan(),
        meals: [
          {
            slotLabelGreek: 'Πρωινό Γεύμα',
            descriptionGreek: 'IKNO 4S; endstream endobj <</Subtype /OpenType>>',
            movementSynergyGreek: '',
          },
        ],
      };
      expect(isGarbledDietPlan(corruptedPlan)).toBe(true);
    });

    it('provides 30 specialist protocols, 8 life scenarios, and targeted clinical pain routing', () => {
      expect(HOME_WORKOUT_PROTOCOLS.length).toBe(30);
      expect(LIFE_SCENARIO_PRESETS.length).toBe(8);

      for (const p of HOME_WORKOUT_PROTOCOLS) {
        expect(p.specialistBadgeGreek?.length).toBeGreaterThan(3);
        expect(p.physiologyAndOrthopedicsGreek?.length).toBeGreaterThan(15);
        expect(p.placeTags?.length).toBeGreaterThan(0);
        expect(p.emotionTags?.length).toBeGreaterThan(0);
        expect(p.attireTags?.length).toBeGreaterThan(0);
      }

      const kneeRec = calculateRecommendation(
        {
          mood: 3,
          energy: 3,
          painLevel: 5,
          painLocation: 'γόνατο',
          timeWindowMins: 10,
          environment: 'home_slippers',
        },
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );
      expect(kneeRec.title).toContain('Ορθοπεδικό Πρωτόκολλο Αποφόρτισης Γόνατος');
      expect(kneeRec.whatWeAchieveGreek).toContain('Ορθοπεδική Προστασία Χόνδρου');

      const backRec = calculateRecommendation(
        {
          mood: 3,
          energy: 3,
          painLevel: 5,
          painLocation: 'μέση / ισχίο',
          timeWindowMins: 10,
          environment: 'home_slippers',
        },
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );
      expect(backRec.title).toContain('Πρωτόκολλο Φυσιάτρου: Αποσυμπίεση Μέσης');
      expect(backRec.whatWeAchieveGreek).toContain('McKenzie');

      const rheumRec = calculateRecommendation(
        {
          mood: 3,
          energy: 2,
          painLevel: 4,
          painLocation: 'πρωινή ακαμψία / αρθρώσεις',
          timeWindowMins: 10,
          environment: 'home_slippers',
        },
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );
      expect(rheumRec.title).toContain('Πρωτόκολλο Ρευματολόγου');
      expect(rheumRec.whatWeAchieveGreek).toContain('αρθρικό υγρό');
    });
  });
});
