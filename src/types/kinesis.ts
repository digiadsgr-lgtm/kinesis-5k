export type StageId = 0 | 1 | 2 | 3 | 4 | 5;

export type EnvironmentType =
  | 'indoor_clothes' // Γραφείο / Ρούχα Γραφείου (όρθιες, διακριτικές κινήσεις χωρίς ίδρωμα)
  | 'home_slippers' // Σπίτι / Παντόφλα & Ρούχα Σπιτιού (καρέκλα, καναπές, χαλί, τοίχος — χωρίς παπούτσια)
  | 'home_gear' // Σπίτι / Με Αθλητικά ή Διάδρομο (πλήρης εκγύμναση σπιτιού, σκάλα, διάδρομος)
  | 'outdoor'; // Έξω / Αθλητικά Παπούτσια (περπάτημα, εναλλαγές, τρέξιμο)

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
  runningReadiness: number; // 0 - 100 (weighted tendon/aerobic load)
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
    subtitleGreek: 'Μηδενικό κόστος εκκίνησης & νευρομυϊκή αφύπνιση',
    descriptionGreek:
      'Στόχος δεν είναι η γυμναστική, αλλά η καταστροφή της στατικότητας του γραφείου. Κάθε 2λεπτη ή 5λεπτη κίνηση χτίζει το νευρικό κύκλωμα της συνέπειας.',
    minHabitScoreToAdvance: 45,
    minReadinessToAdvance: 15,
    allowedModalities: ['mobility', 'walk', 'stairs'],
  },
  1: {
    id: 1,
    code: 'STAGE 1',
    titleGreek: 'Αερόβια Βάση & Ρυθμός',
    subtitleGreek: 'Σταθερό περπάτημα, σκάλες & έλεγχος αναπνοής (Zone 1-2)',
    descriptionGreek:
      'Αύξηση της αιμάτωσης και ενεργοποίηση μιτοχονδρίων χωρίς κραδασμούς. Προετοιμασία αρθρώσεων και πελματιαίας περιτονίας.',
    minHabitScoreToAdvance: 60,
    minReadinessToAdvance: 35,
    allowedModalities: ['walk', 'stairs', 'treadmill', 'mobility', 'strength'],
  },
  2: {
    id: 2,
    code: 'STAGE 2',
    titleGreek: 'Δομική Θωράκιση & Εναλλαγές',
    subtitleGreek: 'Εισαγωγή ήπιων εναλλαγών περπατήματος-τρεξίματος',
    descriptionGreek:
      'Οι τένοντες (Αχίλλειος, επιγονατιδικός) χρειάζονται προοδευτικό μηχανικό φορτίο. Ελεγχόμενα διαστήματα ήπιου τρεξίματος με πλήρη αποκατάσταση.',
    minHabitScoreToAdvance: 70,
    minReadinessToAdvance: 55,
    allowedModalities: ['walk_run', 'walk', 'treadmill', 'strength', 'mobility', 'stairs'],
  },
  3: {
    id: 3,
    code: 'STAGE 3',
    titleGreek: 'Συνεχόμενη Ροή (20-30 λεπτά)',
    subtitleGreek: 'Σταθεροποίηση δρομικής οικονομίας & διαχείριση κόπωσης',
    descriptionGreek:
      'Μετάβαση από διαλλειματική κίνηση σε συνεχή αερόβιο ρυθμό. Έμφαση στη χαμηλή καρδιακή συχνότητα και την ελαστική επιστροφή ενέργειας.',
    minHabitScoreToAdvance: 80,
    minReadinessToAdvance: 75,
    allowedModalities: ['run', 'walk_run', 'treadmill', 'strength', 'mobility', 'walk'],
  },
  4: {
    id: 4,
    code: 'STAGE 4',
    titleGreek: 'Κατάκτηση 5km',
    subtitleGreek: 'Ολοκλήρωση 5 χιλιομέτρων με άνεση και μηδενικό τραυματισμό',
    descriptionGreek:
      'Πλήρης αερόβια και τενόντια προσαρμογή για 5 συνεχόμενα χιλιόμετρα. Το σώμα πλέον αναζητά την κίνηση ως αποσυμπίεση.',
    minHabitScoreToAdvance: 85,
    minReadinessToAdvance: 90,
    allowedModalities: ['run', 'treadmill', 'walk_run', 'strength', 'mobility', 'walk'],
  },
  5: {
    id: 5,
    code: 'STAGE 5',
    titleGreek: 'Αγωνιστική Ετοιμότητα 5K',
    subtitleGreek: 'Βελτιστοποίηση ρυθμού, VO2max & στρατηγική αγώνα',
    descriptionGreek:
      'Εξειδικευμένες προσαρμογές ρυθμού, νευρομυϊκής ισχύος και αποκατάστασης για ασφαλή και απολαυστική συμμετοχή σε αγώνα 5km.',
    minHabitScoreToAdvance: 100,
    minReadinessToAdvance: 100,
    allowedModalities: ['run', 'treadmill', 'strength', 'mobility', 'walk_run', 'walk'],
  },
};

export const MODALITY_LABELS_GREEK: Record<ModalityType, string> = {
  walk: 'Ζωηρό Περπάτημα',
  stairs: 'Ανάβαση Σκάλας',
  treadmill: 'Διάδρομος',
  mobility: 'Ξεμπλοκάρισμα Σώματος & Διατάσεις',
  strength: 'Ενδυνάμωση Ποδιών & Κορμού',
  walk_run: 'Εναλλαγές Περπάτημα / Τρέξιμο',
  run: 'Συνεχόμενο Τρέξιμο',
};

export const ENVIRONMENT_LABELS_GREEK: Record<EnvironmentType, string> = {
  indoor_clothes: 'Γραφείο / Ρούχα Γραφείου (όρθιες κινήσεις, χωρίς ίδρωμα)',
  home_slippers: 'Σπίτι / Με Παντόφλα & Ρούχα Σπιτιού (καναπές, χαλί, καρέκλα)',
  home_gear: 'Σπίτι / Με Αθλητικά Παπούτσια ή Διάδρομο',
  outdoor: 'Έξω στον Δρόμο / Πάρκο με Αθλητικά',
};

export const REJECTION_REASON_LABELS_GREEK: Record<RejectionReason, string> = {
  boredom: 'Βαρεμάρα / Μονοτονία',
  lack_of_time: 'Πίεση Χρόνου',
  pain_fatigue: 'Πόνος ή Εξάντληση',
  environment_lock: 'Περιορισμός Χώρου / Ρούχων',
};
