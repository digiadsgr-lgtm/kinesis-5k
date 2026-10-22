import { describe, expect, it } from 'vitest';
import {
  applyMovementToProgression,
  calculateMOS,
  calculateRecommendation,
} from './recommender';
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
        4, // Stage 4 (5K stage)
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
        rhr: 64, // +8 bpm above baseline
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

  describe('2. Movement Opportunity Score (MOS) & Threshold 40', () => {
    it('triggers Zero-Friction Protocol (2-5 mins) when MOS < 40', () => {
      const lowCheckIn: CheckInInput = {
        mood: 1, // (1/5)*35 = 7
        energy: 1, // (1/5)*25 = 5
        timeWindowMins: 5, // (5/30)*20 = 3.33
        environment: 'indoor_clothes', // ((100-75)/100)*20 = 5 => total ~20
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
      expect(rec.intensityLabel).toContain('Zero-Friction');
      expect(rec.habitPointsAward).toBeGreaterThanOrEqual(14);
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

  describe('3. Behavioral Memory & Rejection Taxonomy', () => {
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

    it('provides a distinct boredAlternative modality and a 2-5 min hardDowngrade', () => {
      const rec = calculateRecommendation(
        highReadinessCheckIn,
        2,
        healthyBiometrics,
        normalBiomarkers,
        []
      );

      expect(rec.boredAlternative.modality).not.toBe(rec.modality);
      expect(rec.hardDowngrade.durationMins).toBeLessThanOrEqual(5);
      expect(rec.hardDowngrade.habitPointsAward).toBeGreaterThanOrEqual(14);
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
});
