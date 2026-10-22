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
import { HOME_WORKOUT_PROTOCOLS } from './homeWorkouts';
import {
  BiomarkerProfile,
  CheckInInput,
  DailyBiometrics,
  UserProgressionState,
} from '@/types/kinesis';

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

    it('provides 16 equipment-free home conditioning protocols with step-by-step Greek exercises', () => {
      expect(HOME_WORKOUT_PROTOCOLS.length).toBe(16);
      for (const proto of HOME_WORKOUT_PROTOCOLS) {
        expect(proto.equipmentGreek).toBe('Κανένας εξοπλισμός');
        expect(proto.exercisesGreek.length).toBeGreaterThan(0);
        expect(proto.whatWeAchieveGreek.length).toBeGreaterThan(10);
        expect(proto.habitPointsAward).toBeGreaterThanOrEqual(14);
      }
    });
  });
});
