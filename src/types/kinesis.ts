export type StageId = 0 | 1 | 2 | 3 | 4 | 5;

export type EnvironmentType =
  | 'indoor_clothes' // Στο Γραφείο / Με Ρούχα Δουλειάς (όρθιες κινήσεις, χωρίς ίδρωμα)
  | 'home_slippers' // Στο Σπίτι / Με Παντόφλα ή Κάλτσες (χωρίς κανέναν εξοπλισμό)
  | 'home_gear' // Στο Σπίτι / Έτοιμος για Γυμναστική (χωρίς κανέναν εξοπλισμό)
  | 'outdoor'; // Έξω στον Δρόμο / Πάρκο (περπάτημα ή τρέξιμο)

export type ModalityType =
  | 'walk'
  | 'stairs'
  | 'treadmill'
  | 'mobility'
  | 'strength'
  | 'walk_run'
  | 'run';

export type RejectionReason =
  | 'boredom'
  | 'lack_of_time'
  | 'pain_fatigue'
  | 'environment_lock';

export type MoodScore = 1 | 2 | 3 | 4 | 5;
export type EnergyScore = 1 | 2 | 3 | 4 | 5;

export interface BiomarkerProfile {
  ferritin: number | null; // ng/mL
  hemoglobin: number | null; // g/dL
  vitaminD: number | null; // ng/mL
  vitaminB12: number | null; // pg/mL
  crp: number | null; // mg/L
  fastingGlucose: number | null; // mg/dL
  medicalRestrictions: string;
  updatedAt?: string;
}

export interface DailyBiometrics {
  rhr: number; // bpm
  baselineRhr: number; // bpm
  hrv: number; // ms
  sleepScore: number; // 0-100
  stepsSoFar: number;
  weight: number; // kg
  date?: string;
}

export interface CheckInInput {
  mood: MoodScore; // 1-5
  energy: EnergyScore; // 1-5
  timeWindowMins: number; // e.g., 2, 5, 10, 15, 20, 30, 45
  environment: EnvironmentType;
  painLevel: number; // 0-10
  painLocation: string;
}

export interface AlternativePrescription {
  id: string;
  title: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  reasoningGreek: string;
  whatWeAchieveGreek: string;
  stepByStepGreek: string[];
  habitPointsAward: number;
  structuralPointsAward: number;
}

export interface RecommendationOutput {
  id: string;
  title: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  reasoningGreek: string;
  whatWeAchieveGreek: string;
  stepByStepGreek: string[];
  safetyAlertsGreek: string[];
  mosScore: number;
  habitPointsAward: number;
  structuralPointsAward: number;
  boredAlternative: AlternativePrescription;
  hardDowngrade: AlternativePrescription;
  safetyGateTriggered?: boolean;
  zeroFrictionTriggered?: boolean;
}

export interface RejectionEvent {
  id: string;
  timestamp: string;
  modality: ModalityType;
  reason: RejectionReason;
  stageAtTime: StageId;
  mosAtTime: number;
}

export interface MovementLog {
  id: string;
  timestamp: string;
  title: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  habitPointsEarned: number;
  structuralPointsEarned: number;
  rpe?: number; // 1-10
  notes?: string;
  wasNegotiated?: 'primary' | 'bored_swap' | 'micro_step' | 'manual_log';
}

export interface UserProgressionState {
  id: 'singleton';
  currentStage: StageId;
  habitConsistencyScore: number; // 0 - 100
  runningReadiness: number; // 0 - 100
  totalSessionsCompleted: number;
  lastActiveDate: string | null;
  lastCheckIn: CheckInInput;
}

export interface KinesisDatabaseDump {
  schemaVersion: string;
  exportedAt: string;
  progression: UserProgressionState;
  biometrics: DailyBiometrics;
  biomarkers: BiomarkerProfile;
  logs: MovementLog[];
  rejections: RejectionEvent[];
  pdfHistory?: unknown[];
  transformationGoal?: unknown;
  uploadedDietPlan?: unknown;
  smartwatchHistory?: unknown[];
}

export interface StageDefinition {
  id: StageId;
  code: string;
  titleGreek: string;
  subtitleGreek: string;
  descriptionGreek: string;
  minHabitScoreToAdvance: number;
  minReadinessToAdvance: number;
  allowedModalities: ModalityType[];
}

export const STAGES: Record<StageId, StageDefinition> = {
  0: {
    id: 0,
    code: 'STAGE 0',
    titleGreek: 'Σπάσιμο Αδράνειας',
    subtitleGreek: 'Ξεκινάμε εύκολα, χωρίς πίεση, με 2 έως 5 λεπτά κίνησης',
    descriptionGreek:
      'Στόχος δεν είναι να κουραστείς, αλλά να σηκωθείς από την καρέκλα. Κάθε μικρή κίνηση ξυπνάει το σώμα και χτίζει τη συνήθεια.',
    minHabitScoreToAdvance: 45,
    minReadinessToAdvance: 15,
    allowedModalities: ['mobility', 'walk', 'stairs'],
  },
  1: {
    id: 1,
    code: 'STAGE 1',
    titleGreek: 'Ρυθμός & Ανάσα',
    subtitleGreek: 'Άνετο περπάτημα και ήπια ενδυνάμωση χωρίς λαχάνιασμα',
    descriptionGreek:
      'Βελτιώνουμε την κυκλοφορία του αίματος και δυναμώνουμε πόδια και μέση χωρίς κανέναν κραδασμό στις αρθρώσεις.',
    minHabitScoreToAdvance: 60,
    minReadinessToAdvance: 35,
    allowedModalities: ['walk', 'stairs', 'treadmill', 'mobility', 'strength'],
  },
  2: {
    id: 2,
    code: 'STAGE 2',
    titleGreek: 'Δυνατά Πόδια & Εναλλαγές',
    subtitleGreek: 'Περπάτημα με μικρά διαστήματα πολύ χαλαρού τρεξίματος',
    descriptionGreek:
      'Τα γόνατα και οι αστράγαλοι δυναμώνουν σταδιακά. Εναλλάσσουμε περπάτημα με 1 λεπτό χαλαρό τζόκινγκ.',
    minHabitScoreToAdvance: 70,
    minReadinessToAdvance: 55,
    allowedModalities: ['walk_run', 'walk', 'treadmill', 'strength', 'mobility', 'stairs'],
  },
  3: {
    id: 3,
    code: 'STAGE 3',
    titleGreek: 'Συνεχόμενη Ροή (20-30 λεπτά)',
    subtitleGreek: 'Σταθερό, ξεκούραστο τρέξιμο σε ρυθμό συζήτησης',
    descriptionGreek:
      'Το σώμα πλέον κινείται άνετα για 20-30 λεπτά. Κρατάμε χαμηλούς παλμούς και απολαμβάνουμε τη ροή.',
    minHabitScoreToAdvance: 80,
    minReadinessToAdvance: 75,
    allowedModalities: ['run', 'walk_run', 'treadmill', 'strength', 'mobility', 'walk'],
  },
  4: {
    id: 4,
    code: 'STAGE 4',
    titleGreek: 'Κατάκτηση 5 Χιλιομέτρων',
    subtitleGreek: 'Ολοκλήρωση 5km με άνεση, χαμόγελο και μηδενικό τραυματισμό',
    descriptionGreek:
      'Έχεις χτίσει την αντοχή και τη δύναμη για 5 συνεχόμενα χιλιόμετρα. Η κίνηση έχει γίνει πλέον ανάγκη και ξεκούραση.',
    minHabitScoreToAdvance: 85,
    minReadinessToAdvance: 90,
    allowedModalities: ['run', 'treadmill', 'walk_run', 'strength', 'mobility', 'walk'],
  },
  5: {
    id: 5,
    code: 'STAGE 5',
    titleGreek: 'Ετοιμότητα Αγώνα 5K',
    subtitleGreek: 'Βελτίωση ρυθμού και ενέργειας για τον αγώνα σου',
    descriptionGreek:
      'Εξειδικευμένες ασκήσεις ρυθμού και αποκατάστασης για να απολαύσεις τον αγώνα 5km με ασφάλεια.',
    minHabitScoreToAdvance: 100,
    minReadinessToAdvance: 100,
    allowedModalities: ['run', 'treadmill', 'strength', 'mobility', 'walk_run', 'walk'],
  },
};

export const MODALITY_LABELS_GREEK: Record<ModalityType, string> = {
  walk: 'Ζωηρό Περπάτημα',
  stairs: 'Ανάβαση Σκάλας',
  treadmill: 'Διάδρομος',
  mobility: 'Ξεμπλοκάρισμα & Ευλυγισία',
  strength: 'Ενδυνάμωση Χωρίς Όργανα',
  walk_run: 'Περπάτημα & Χαλαρό Τρέξιμο',
  run: 'Συνεχόμενο Τρέξιμο',
};

export const ENVIRONMENT_LABELS_GREEK: Record<EnvironmentType, string> = {
  indoor_clothes: 'Γραφείο / Με Ρούχα Δουλειάς (Όρθιες κινήσεις, χωρίς ίδρωμα)',
  home_slippers: 'Σπίτι / Με Παντόφλα ή Κάλτσες (Χωρίς κανέναν εξοπλισμό)',
  home_gear: 'Σπίτι / Έτοιμος για Γυμναστική (Χωρίς κανέναν εξοπλισμό)',
  outdoor: 'Έξω στον Δρόμο ή στο Πάρκο (Περπάτημα / Τρέξιμο)',
};

export const REJECTION_REASON_LABELS_GREEK: Record<RejectionReason, string> = {
  boredom: 'Βαρεμάρα / Μονοτονία',
  lack_of_time: 'Πίεση Χρόνου',
  pain_fatigue: 'Πόνος ή Κούραση',
  environment_lock: 'Περιορισμός Χώρου / Ρούχων',
};
