import { EnvironmentType, EnergyScore, ModalityType, MoodScore } from '@/types/kinesis';

export type HomeWorkoutCategory =
  | 'physiatry_rehab'
  | 'orthopedics_joints'
  | 'rheumatology_flow'
  | 'sports_specialist'
  | 'physiology_metabolism'
  | 'office_clothes'
  | 'home_slippers'
  | 'tendon_core'
  | 'calisthenics_strength'
  | 'home_cardio';

export type ScenarioPlaceTag =
  | 'living_room'
  | 'office'
  | 'small_space_2m'
  | 'bedroom_hotel'
  | 'outdoor_park';

export type ScenarioEmotionTag =
  | 'bored_inertia'
  | 'stressed_anxious'
  | 'exhausted_heavy'
  | 'stiff_achy'
  | 'energized_athletic';

export type ScenarioAttireTag =
  | 'pajamas_slippers'
  | 'formal_office'
  | 'casual_home'
  | 'sportswear';

export const SCENARIO_PLACE_LABELS: Record<ScenarioPlaceTag, string> = {
  living_room: '🛋️ Σαλόνι / Δίπλα στον Καναπέ',
  office: '💼 Γραφείο / Δουλειά',
  small_space_2m: '📏 Μικρός Χώρος (2m²) / Κουζίνα / Διάδρομος',
  bedroom_hotel: '🛏️ Υπνοδωμάτιο / Ξενοδοχείο / Μπαλκόνι',
  outdoor_park: '🌳 Έξω στον Δρόμο / Πάρκο / Πυλωτή',
};

export const SCENARIO_EMOTION_LABELS: Record<ScenarioEmotionTag, string> = {
  bored_inertia: '🥱 Βαρεμάρα / Κολλημένος στον Καναπέ',
  stressed_anxious: '🤯 Στρες, Πίεση & Θολωμένο Μυαλό',
  exhausted_heavy: '🔋 Εξάντληση / Βαρύ Σώμα / Μετά το Φαγητό',
  stiff_achy: '🦴 Πιασμένος / Πρωινή Ακαμψία / Ευαίσθητες Αρθρώσεις',
  energized_athletic: '⚡ Όρεξη για Δράση & Αθλητικό Ρυθμό',
};

export const SCENARIO_ATTIRE_LABELS: Record<ScenarioAttireTag, string> = {
  pajamas_slippers: '🧦 Πιτζάμες / Παντόφλα / Κάλτσες',
  formal_office: '👔 Ρούχα Γραφείου / Πουκάμισο / Τζιν',
  casual_home: '👕 Καθημερινά Ρούχα Σπιτιού (Φόρμα/Μπλούζα)',
  sportswear: '👟 Αθλητικά Παπούτσια & Ρούχα',
};

export interface HomeWorkoutProtocol {
  id: string;
  titleGreek: string;
  category: HomeWorkoutCategory;
  categoryLabelGreek: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  equipmentGreek: string;
  whatWeAchieveGreek: string;
  exercisesGreek: string[];
  habitPointsAward: number;
  structuralPointsAward: number;
  specialistBadgeGreek?: string;
  physiologyAndOrthopedicsGreek?: string;
  placeTags?: ScenarioPlaceTag[];
  emotionTags?: ScenarioEmotionTag[];
  attireTags?: ScenarioAttireTag[];
}

export interface LifeScenarioPreset {
  id: string;
  iconEmoji: string;
  titleGreek: string;
  subtitleGreek: string;
  placeLabelGreek: string;
  emotionLabelGreek: string;
  attireLabelGreek: string;
  specialistLabelGreek: string;
  recommendedProtocolId: string;
  checkInPatch: {
    environment: EnvironmentType;
    mood: MoodScore;
    energy: EnergyScore;
    timeWindowMins: number;
    painLevel?: number;
  };
}

export type CustomMoodPacing = 'gentle' | 'balanced' | 'energized';
export type CustomSpaceContext =
  | 'home_comfortable'
  | 'office_discrete'
  | 'tiny_space_2m'
  | 'outdoor_sport';

export interface ProtocolCustomizationParams {
  durationMins: number | 'auto';
  moodPacing: CustomMoodPacing;
  spaceContext: CustomSpaceContext;
}

export const CUSTOM_MOOD_LABELS: Record<CustomMoodPacing, string> = {
  gentle: '🌱 Ήπια & Ξεκούραστα (Χαμηλή Ενέργεια)',
  balanced: '🙂 Κανονικός Ρυθμός',
  energized: '⚡ Δυναμικά & Αθλητικά',
};

export const CUSTOM_SPACE_LABELS: Record<CustomSpaceContext, string> = {
  home_comfortable: '🛋️ Σπίτι (Παντόφλα / Πιτζάμες)',
  office_discrete: '💼 Γραφείο (Ρούχα Δουλειάς • Χωρίς Ίδρωμα)',
  tiny_space_2m: '📏 Μικρός Χώρος (2m²)',
  outdoor_sport: '🌳 Άνετος Χώρος / Αθλητικά',
};

/**
 * Dynamically adapts any specialist or scenario protocol to the user's selected
 * Time (minutes), Mood/Energy pacing, and Space/Attire context.
 */
export function customizeProtocolForUser(
  protocol: HomeWorkoutProtocol,
  params: ProtocolCustomizationParams
): HomeWorkoutProtocol {
  const targetMins =
    params.durationMins === 'auto' ? protocol.durationMins : Math.max(2, params.durationMins);
  const cleanTitle = protocol.titleGreek.replace(/^\d+'\s*/, '');
  const adaptedTitle = `${targetMins}' ${cleanTitle}`;

  const moodTagGreek =
    params.moodPacing === 'gentle'
      ? 'Αργός & Ήρεμος Ρυθμός'
      : params.moodPacing === 'energized'
      ? 'Δυναμική Ροή'
      : 'Ισορροπημένος Ρυθμός';

  const spaceTagGreek =
    params.spaceContext === 'office_discrete'
      ? 'Γραφείο (Χωρίς Ίδρωμα)'
      : params.spaceContext === 'tiny_space_2m'
      ? 'Σε 2m² Χώρο'
      : params.spaceContext === 'outdoor_sport'
      ? 'Άνετος Χώρος'
      : 'Σπίτι / Παντόφλα';

  const adaptedIntensity = `${targetMins} Λεπτά • ${moodTagGreek} • ${spaceTagGreek}`;

  const stepCount = Math.max(1, protocol.exercisesGreek.length);
  const minsPerStep = Math.max(0.5, Math.round((targetMins / stepCount) * 10) / 10);
  const stepTimeText =
    minsPerStep < 1 ? `${Math.round(minsPerStep * 60)} δευτ.` : `${minsPerStep} λεπτά`;

  const adaptedExercises = protocol.exercisesGreek.map((ex, idx) => {
    const stripped = ex.replace(/^Βήμα\s*\d+\s*(\([^)]*\))?\s*[:—-]?\s*/i, '');
    return `Βήμα ${idx + 1} (~${stepTimeText}): ${stripped}`;
  });

  const coachingAdjustmentParts: string[] = [];
  if (params.moodPacing === 'gentle') {
    coachingAdjustmentParts.push(
      'Εκτέλεσε τις κινήσεις στο 60% του εύρους, αργά και με βαθιές εκπνοές χωρίς καμία πίεση.'
    );
  } else if (params.moodPacing === 'energized') {
    coachingAdjustmentParts.push(
      'Διατήρησε συνεχή ρυθμική ροή ανάμεσα στα βήματα με ενεργό κορμό.'
    );
  }
  if (params.spaceContext === 'office_discrete') {
    coachingAdjustmentParts.push(
      'Όλες οι κινήσεις γίνονται όρθιες και διακριτικές με ρούχα γραφείου χωρίς να ιδρώσεις.'
    );
  } else if (params.spaceContext === 'tiny_space_2m') {
    coachingAdjustmentParts.push(
      'Προσαρμογή 2m²: Κάνε όλα τα βήματα επιτόπου (στη θέση σου) χωρίς μετακίνηση στον χώρο.'
    );
  }

  if (coachingAdjustmentParts.length > 0) {
    adaptedExercises.push(`⚙️ Προσαρμογή στα μέτρα σου: ${coachingAdjustmentParts.join(' ')}`);
  }

  const ratio = targetMins / Math.max(1, protocol.durationMins);
  const adaptedStructural = Math.max(2, Math.round(protocol.structuralPointsAward * ratio));

  return {
    ...protocol,
    titleGreek: adaptedTitle,
    durationMins: targetMins,
    intensityLabel: adaptedIntensity,
    exercisesGreek: adaptedExercises,
    structuralPointsAward: adaptedStructural,
  };
}

export const HOME_WORKOUT_CATEGORY_LABELS: Record<HomeWorkoutCategory, string> = {
  physiatry_rehab: '🩺 Φυσίατροι (Μέση, Αυχένας & Στάση)',
  orthopedics_joints: '🦴 Ορθοπεδικοί (Γόνατα, Ισχία & Τένοντες)',
  rheumatology_flow: '🤲 Ρευματολόγοι (Πρωινή Ακαμψία & Αρθρώσεις)',
  sports_specialist: '🏅 Ειδικοί Γυμναστές Αθλημάτων',
  physiology_metabolism: '🧬 Φυσιολογία (Σάκχαρο, Παλμοί & Στρες)',
  office_clothes: '💼 Γραφείο (Ρούχα Δουλειάς)',
  home_slippers: '🧦 Σπίτι (Με Παντόφλα / Πιτζάμες)',
  tendon_core: '🦵 Πόδια, Γόνατα & Μέση',
  calisthenics_strength: '💪 Ολόσωμη Δύναμη',
  home_cardio: '🔥 Αερόβιο Σπιτιού (Χωρίς Άλματα)',
};

export const LIFE_SCENARIO_PRESETS: LifeScenarioPreset[] = [
  {
    id: 'scen-couch-pajamas',
    iconEmoji: '🛋️',
    titleGreek: 'Κολλημένος στον καναπέ με πιτζάμες/παντόφλα',
    subtitleGreek: 'Μηδενική όρεξη — θέλω κάτι πανεύκολο σε 3 λεπτά χωρίς να αλλάξω ρούχα',
    placeLabelGreek: 'Σαλόνι / Καναπές',
    emotionLabelGreek: 'Βαρεμάρα / Αδράνεια',
    attireLabelGreek: 'Πιτζάμες / Παντόφλα / Κάλτσες',
    specialistLabelGreek: 'Εργοφυσιολογία & Αφύπνιση Ντοπαμίνης',
    recommendedProtocolId: 'physio-glucose-soleus-3',
    checkInPatch: {
      environment: 'home_slippers',
      mood: 2,
      energy: 2,
      timeWindowMins: 5,
      painLevel: 0,
    },
  },
  {
    id: 'scen-office-stiff-back',
    iconEmoji: '💼',
    titleGreek: 'Πιασμένη μέση & αυχένας στο γραφείο (με ρούχα δουλειάς)',
    subtitleGreek: 'Καθόμουν ώρες στην καρέκλα, φοράω πουκάμισο/τζιν και δεν θέλω να ιδρώσω',
    placeLabelGreek: 'Γραφείο',
    emotionLabelGreek: 'Πιάσιμο & Κούραση Οθόνης',
    attireLabelGreek: 'Ρούχα Δουλειάς / Τζιν',
    specialistLabelGreek: 'Πρωτόκολλο Φυσιάτρου (McKenzie Όρθιο)',
    recommendedProtocolId: 'physiatry-lumbar-mckenzie-4',
    checkInPatch: {
      environment: 'indoor_clothes',
      mood: 3,
      energy: 3,
      timeWindowMins: 5,
      painLevel: 2,
    },
  },
  {
    id: 'scen-morning-rheuma',
    iconEmoji: '🌅',
    titleGreek: 'Πρωινή δυσκαμψία & «σκουριασμένες» αρθρώσεις',
    subtitleGreek: 'Μόλις ξύπνησα, νιώθω τα γόνατα, τη μέση και τα δάχτυλα βαριά και άκαμπτα',
    placeLabelGreek: 'Υπνοδωμάτιο / Σαλόνι',
    emotionLabelGreek: 'Πρωινή Ακαμψία',
    attireLabelGreek: 'Πιτζάμες / Κάλτσες',
    specialistLabelGreek: 'Πρωτόκολλο Ρευματολόγου (Αρθρικό Υγρό)',
    recommendedProtocolId: 'rheuma-morning-synovial-4',
    checkInPatch: {
      environment: 'home_slippers',
      mood: 3,
      energy: 2,
      timeWindowMins: 5,
      painLevel: 2,
    },
  },
  {
    id: 'scen-ortho-knee-protect',
    iconEmoji: '🦵',
    titleGreek: 'Ευαίσθητα γόνατα ή βάρος 85kg+ (Φόβος κραδασμών)',
    subtitleGreek: 'Θέλω να δυναμώσω τα πόδια μου με απόλυτη ασφάλεια για τους χόνδρους',
    placeLabelGreek: 'Σπίτι / Σαλόνι',
    emotionLabelGreek: 'Ανασφάλεια Αρθρώσεων',
    attireLabelGreek: 'Παντόφλα ή Αθλητικά',
    specialistLabelGreek: 'Πρωτόκολλο Ορθοπεδικού (Ισομετρική Ασπίδα)',
    recommendedProtocolId: 'ortho-knee-cartilage-5',
    checkInPatch: {
      environment: 'home_slippers',
      mood: 3,
      energy: 3,
      timeWindowMins: 10,
      painLevel: 3,
    },
  },
  {
    id: 'scen-stress-overwhelmed',
    iconEmoji: '🤯',
    titleGreek: 'Έντονο στρες, εκνευρισμός & ταχυπαλμία',
    subtitleGreek: 'Το μυαλό μου τρέχει, θέλω να πέσουν οι παλμοί και η κορτιζόλη τώρα',
    placeLabelGreek: 'Οπουδήποτε (2m²)',
    emotionLabelGreek: 'Στρες & Ένταση',
    attireLabelGreek: 'Οποιαδήποτε Ένδυση',
    specialistLabelGreek: 'Φυσιολογία Πνευμονογαστρικού Νεύρου',
    recommendedProtocolId: 'physio-vagus-cortisol-5',
    checkInPatch: {
      environment: 'home_slippers',
      mood: 1,
      energy: 2,
      timeWindowMins: 5,
      painLevel: 0,
    },
  },
  {
    id: 'scen-post-meal-glucose',
    iconEmoji: '🍽️',
    titleGreek: 'Μόλις έφαγα & νιώθω βάρος / υπνηλία',
    subtitleGreek: 'Θέλω να καεί το ζάχαρο στους μύες χωρίς να ανακατευτεί το στομάχι μου',
    placeLabelGreek: 'Κουζίνα / Γραφείο / Σαλόνι',
    emotionLabelGreek: 'Μεταγευματική Υπνηλία',
    attireLabelGreek: 'Καθημερινά Ρούχα',
    specialistLabelGreek: 'Εργοφυσιολογία (Αντλία Υποκνημίδιου Μυός)',
    recommendedProtocolId: 'physio-glucose-soleus-3',
    checkInPatch: {
      environment: 'indoor_clothes',
      mood: 3,
      energy: 2,
      timeWindowMins: 5,
      painLevel: 0,
    },
  },
  {
    id: 'scen-small-space-rain',
    iconEmoji: '🌧️',
    titleGreek: 'Βρέχει / Κρύο έξω & έχω μόνο 2 τετραγωνικά χώρο',
    subtitleGreek: 'Είμαι κλεισμένος μέσα αλλά θέλω να ιδρώσω ήπια και να κάψω λίπος αθόρυβα',
    placeLabelGreek: 'Μικρός Χώρος 2m² / Διάδρομος',
    emotionLabelGreek: 'Κλεισούρα στο Σπίτι',
    attireLabelGreek: 'Φόρμα / Κάλτσες',
    specialistLabelGreek: 'Εργοφυσιολογία Zone 2 & Προπονητής Στίβου',
    recommendedProtocolId: 'physio-zone2-mitochondria-12',
    checkInPatch: {
      environment: 'home_gear',
      mood: 3,
      energy: 3,
      timeWindowMins: 15,
      painLevel: 0,
    },
  },
  {
    id: 'scen-athletic-flow',
    iconEmoji: '🏅',
    titleGreek: 'Έχω ενέργεια & θέλω προπόνηση Ειδικού Γυμναστή!',
    subtitleGreek: 'Νιώθω καλά και θέλω τεχνική δρομέα, αναπνοή κολυμβητή ή δύναμη ορειβάτη',
    placeLabelGreek: 'Σπίτι ή Πάρκο',
    emotionLabelGreek: 'Δυναμική Διάθεση',
    attireLabelGreek: 'Ανετα Ρούχα / Αθλητικά',
    specialistLabelGreek: 'Προπονητής Στίβου & Κλασικού Αθλητισμού',
    recommendedProtocolId: 'sport-track-running-economy-6',
    checkInPatch: {
      environment: 'home_gear',
      mood: 5,
      energy: 4,
      timeWindowMins: 15,
      painLevel: 0,
    },
  },
];

export const HOME_WORKOUT_PROTOCOLS: HomeWorkoutProtocol[] = [
  // =========================================================================
  // Α. ΠΡΩΤΟΚΟΛΛΑ ΦΥΣΙΑΤΡΩΝ (Physiatry & Neuromuscular Rehabilitation)
  // =========================================================================
  {
    id: 'physiatry-lumbar-mckenzie-4',
    titleGreek: "4' Πρωτόκολλο Φυσιάτρου: Αποσυμπίεση Μέσης & Ισχιακού Νεύρου (Όρθιο)",
    category: 'physiatry_rehab',
    categoryLabelGreek: 'Φυσίατροι (Μέση & Αυχένας)',
    modality: 'mobility',
    durationMins: 4,
    intensityLabel: '4 Λεπτά • Φυσιατρική Αποσυμπίεση • Χωρίς Ίδρωμα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Φυσιάτρου • Σπονδυλική Στήλη',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία & Ορθοπεδική: Το πολύωρο κάθισμα πιέζει τους μεσοσπονδύλιους δίσκους της μέσης (Ο4-Ο5 & Ο5-Ι1) προς τα πίσω. Η ήπια όρθια έκταση McKenzie επαναφέρει τον πυρήνα του δίσκου στο κέντρο και απελευθερώνει τις νευρικές ρίζες.',
    whatWeAchieveGreek:
      'Ξεμπλοκάρουμε τη μέση που «μαγκώνει» από την καρέκλα ή τον καναπέ, επαναφέροντας τη φυσική καμπύλη της σπονδυλικής στήλης από όρθια θέση.',
    exercisesGreek: [
      'Βήμα 1 (1 λεπτό — Όρθια Έκταση McKenzie): Στάσου όρθιος με τα πόδια στο άνοιγμα των ώμων. Βάλε τις παλάμες σου χαμηλά στη μέση και γείρε απαλά τον κορμό προς τα πίσω για 3 δευτερόλεπτα. Επανάλαβε αργά 10 φορές.',
      'Βήμα 2 (1.5 λεπτό — Αποσυμπίεση Λαγονοψοΐτη): Κάνε ένα βήμα πίσω με το δεξί πόδι, κράτα τον κορμό όρθιο και σφίξε τον δεξί γλουτό για 30 δευτερόλεπτα ώστε να ανοίξει το μπροστινό μέρος του γοφού. Άλλαξε πόδι.',
      'Βήμα 3 (1.5 λεπτό — Νευροδυναμική Κίνηση): Περπάτησε ήρεμα στον χώρο πατώντας μαλακά και αφήνοντας τη λεκάνη και τους ώμους να κινούνται ελεύθερα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 4,
    placeTags: ['office', 'living_room', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['stiff_achy', 'exhausted_heavy', 'bored_inertia'],
    attireTags: ['formal_office', 'pajamas_slippers', 'casual_home'],
  },
  {
    id: 'physiatry-cervical-scapula-6',
    titleGreek: "6' Πρωτόκολλο Φυσιάτρου: Αυχένας, Ωμοπλάτη & Κεφαλαλγία Οθόνης",
    category: 'physiatry_rehab',
    categoryLabelGreek: 'Φυσίατροι (Μέση & Αυχένας)',
    modality: 'mobility',
    durationMins: 6,
    intensityLabel: '6 Λεπτά • Κλινική Αποφόρτιση Αυχένα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Φυσιάτρου • Αυχενική Μοίρα',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία & Ορθοπεδική: Για κάθε 2,5 εκ. που το κεφάλι γέρνει μπροστά στην οθόνη, το φορτίο στον αυχένα αυξάνεται κατά 4,5 κιλά! Η retrac-κίνηση (διπλοσάγονο) και η ενεργοποίηση του κάτω τραπεζοειδούς αποφορτίζουν τους αυχενικούς δίσκους.',
    whatWeAchieveGreek:
      'Επαναφέρουμε το κεφάλι πάνω από τους ώμους, αιματώνουμε τους μύες του αυχένα και διώχνουμε το βάρος στους ώμους.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Ολίσθηση Αυχένα / Chin Tuck): Κοίτα ευθεία μπροστά και τράβα απαλά το πηγούνι σου οριζόντια προς τα πίσω (σαν να κάνεις διπλοσάγονο), χωρίς να σκύβεις. Κράτα 3" και χαλάρωσε (12 επαναλήψεις).',
      'Βήμα 2 (2 λεπτά — Κλείδωμα Ωμοπλατών «W»): Λύγισε τους αγκώνες στα πλευρά σου (σχήμα W), τράβα τις ωμοπλάτες πίσω και κάτω (σαν να τις βάζεις στις πίσω τσέπες) για 4 δευτερόλεπτα (12 επαναλήψεις).',
      'Βήμα 3 (2 λεπτά — Απελευθέρωση Άνω Τραπεζοειδούς): Άφησε το δεξί χέρι χαλαρό κάτω και γείρε το αριστερό αυτί προς τον αριστερό ώμο για 30". Άλλαξε πλευρά.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 5,
    placeTags: ['office', 'living_room', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['stiff_achy', 'stressed_anxious'],
    attireTags: ['formal_office', 'pajamas_slippers', 'casual_home'],
  },
  {
    id: 'physiatry-proprioception-8',
    titleGreek: "8' Πρωτόκολλο Φυσιάτρου: Νευρομυϊκή Ισορροπία, Ιδιοδεκτικότητα & Στάση",
    category: 'physiatry_rehab',
    categoryLabelGreek: 'Φυσίατροι (Μέση & Αυχένας)',
    modality: 'strength',
    durationMins: 8,
    intensityLabel: '8 Λεπτά • Νευρομυϊκός Έλεγχος & Σταθερότητα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Φυσιάτρου • Ιδιοδεκτικότητα',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία & Ορθοπεδική: Οι μηχανοϋποδοχείς στο πέλμα και στον αστράγαλο στέλνουν σήματα στον εγκέφαλο σε χιλιοστά του δευτερολέπτου, προστατεύοντας από στραμπουλήγματα και πτώσεις.',
    whatWeAchieveGreek:
      'Εκπαιδεύουμε το νευρικό σύστημα να κρατάει τους αστραγάλους, τα γόνατα και τη λεκάνη απόλυτα ευθυγραμμισμένα σε κάθε βήμα.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Τρίποδο Πέλματος): Στάσου στο δεξί πόδι πατώντας γερά σε 3 σημεία (μεγάλο δάχτυλο, μικρό δάχτυλο, φτέρνα) για 40". Άλλαξε πόδι.',
      'Βήμα 2 (3 λεπτά — Ρολόι Ισορροπίας): Στηρίξου στο αριστερό πόδι και με το δεξί πόδι άγγιξε απαλά το πάτωμα μπροστά (ώρα 12), στο πλάι (ώρα 3) και πίσω (ώρα 6). Κάνε 8 κύκλους σε κάθε πόδι.',
      'Βήμα 3 (3 λεπτά — Βάδιση Ακριβείας Φτέρνα-Μύτη): Περπάτησε 15 βήματα αργά βάζοντας τη φτέρνα του ενός ποδιού ακριβώς μπροστά από τα δάχτυλα του άλλου, με το βλέμμα ψηλά.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 7,
    placeTags: ['living_room', 'office', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['pajamas_slippers', 'casual_home', 'sportswear'],
  },

  // =========================================================================
  // Β. ΠΡΩΤΟΚΟΛΛΑ ΟΡΘΟΠΕΔΙΚΩΝ (Orthopedics, Cartilage & Tendon Armor)
  // =========================================================================
  {
    id: 'ortho-knee-cartilage-5',
    titleGreek: "5' Πρωτόκολλο Ορθοπεδικού: Ισομετρική Ασπίδα Γόνατος & Επιγονατίδας",
    category: 'orthopedics_joints',
    categoryLabelGreek: 'Ορθοπεδικοί (Γόνατα & Τένοντες)',
    modality: 'strength',
    durationMins: 5,
    intensityLabel: '5 Λεπτά • Μηδενική Τριβή Χόνδρου • Ιατρική Ενδυνάμωση',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Ορθοπεδικού • Αρθρικός Χόνδρος Γόνατος',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική Εμβιομηχανική: Σε κάμψη γόνατος μόλις 20°–30° η συμπίεση της επιγονατίδας είναι ελάχιστη, ενώ ο έσω πλατύς τετρακέφαλος (VMO) ενεργοποιείται στο μέγιστο και προκαλεί αναλγησία (μείωση πόνου) στον επιγονατιδικό τένοντα!',
    whatWeAchieveGreek:
      'Δυναμώνουμε τον μυ που κρατάει το γόνατο σταθερό χωρίς να «τρίβεται» η άρθρωση — ιδανικό αν έχεις ευαίσθητα γόνατα ή παραπάνω κιλά.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Ισομετρικό Μικρο-Κάθισμα 25°): Με τα πόδια στο άνοιγμα των ώμων, λύγισε ΕΛΑΧΙΣΤΑ τα γόνατα (μόλις 15-20 εκατοστά) κρατώντας το βάρος στις φτέρνες. Μείνε ακίνητος για 25 δευτερόλεπτα. Ξεκουράσου 15" (3 φορές).',
      'Βήμα 2 (1.5 λεπτό — Ενεργοποίηση Έσω Τετρακεφάλου Όρθιος): Στάσου όρθιος, τέντωσε τελείως το δεξί γόνατο και σφίξε δυνατά τον μηρό σου για 5 δευτερόλεπτα. Χαλάρωσε 2" και κάνε 10 επαναλήψεις σε κάθε πόδι.',
      'Βήμα 3 (1.5 λεπτό — Πλάγια Στήριξη Μέσου Γλουτιαίου): Σήκωσε το δεξί πόδι τεντωμένο 20 εκατοστά στο πλάι και κράτα το εκεί για 15". Επανάλαβε 3 φορές σε κάθε πόδι (ο δυνατός γλουτός προστατεύει το γόνατο από το να γέρνει μέσα).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 6,
    placeTags: ['living_room', 'office', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['stiff_achy', 'bored_inertia'],
    attireTags: ['pajamas_slippers', 'casual_home', 'formal_office', 'sportswear'],
  },
  {
    id: 'ortho-achilles-plantar-6',
    titleGreek: "6' Πρωτόκολλο Ορθοπεδικού: Αχίλλειος Τένοντας & Πελματιαία Απονεύρωση",
    category: 'orthopedics_joints',
    categoryLabelGreek: 'Ορθοπεδικοί (Γόνατα & Τένοντες)',
    modality: 'strength',
    durationMins: 6,
    intensityLabel: '6 Λεπτά • Αναδόμηση Κολλαγόνου Τενόντων',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Ορθοπεδικού • Αχίλλειος & Πέλμα',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική & Φυσιολογία Τενόντων: Οι τένοντες δεν αιματώνονται όπως οι μύες — τρέφονται και ευθυγραμμίζουν τις ίνες κολλαγόνου τους μόνο μέσω αργής, ελεγχόμενης μηχανικής φόρτισης (μηχανομεταγωγή).',
    whatWeAchieveGreek:
      'Θωρακίζουμε τον Αχίλλειο τένοντα, την καμάρα του πέλματος και τις γάμπες ώστε να αντέχουν χιλιόμετρα περπατήματος και τρεξίματος χωρίς τενοντίτιδα.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Ισομετρική Φόρτιση Αχιλλείου): Σήκω στις μύτες των δύο ποδιών μέχρι τη μέση του ύψους και μείνε ακίνητος για 30 δευτερόλεπτα. Ξεκουράσου 15" (3 σετ).',
      'Βήμα 2 (2.5 λεπτά — Αργή Έκκεντρη Φόρτιση 4 Δευτερολέπτων): Ανέβα στις μύτες σε 1 δευτερόλεπτο και κατέβα ΠΟΛΥ ΑΡΓΑ μετρώντας 1-2-3-4 μέχρι η φτέρνα να ακουμπήσει μαλακά κάτω (2 σετ των 12).',
      'Βήμα 3 (1.5 λεπτό — Ενδυνάμωση Υποκνημίδιου με Λυγισμένα Γόνατα): Λύγισε ελαφρά τα γόνατα και κάνε 12 αργές άρσεις στις μύτες (στοχεύει στον βαθύ μυ της γάμπας που κρατάει τον αστράγαλο).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 7,
    placeTags: ['living_room', 'office', 'small_space_2m', 'outdoor_park'],
    emotionTags: ['stiff_achy', 'energized_athletic'],
    attireTags: ['pajamas_slippers', 'casual_home', 'sportswear'],
  },
  {
    id: 'ortho-hip-pelvis-armor-10',
    titleGreek: "10' Ορθοπεδική Σταθεροποίηση Ισχίων & Λεκάνης (Αποφόρτιση Αρθρώσεων)",
    category: 'orthopedics_joints',
    categoryLabelGreek: 'Ορθοπεδικοί (Γόνατα & Τένοντες)',
    modality: 'strength',
    durationMins: 10,
    intensityLabel: '10 Λεπτά • Βιομηχανική Ευθυγράμμιση Κάτω Άκρων',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Ορθοπεδικού • Ισχία & Λεκάνη',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική Εμβιομηχανική: Κατά το τρέξιμο ή το ζωηρό περπάτημα, κάθε πόδι δέχεται 2 έως 3 φορές το σωματικό μας βάρος. Αν η λεκάνη (μέσος γλουτιαίος) είναι δυνατή, το φορτίο απορροφάται μυϊκά αντί να χτυπάει στον χόνδρο του γόνατος.',
    whatWeAchieveGreek:
      'Χτίζουμε «σιδερένια» λεκάνη και γοφούς ώστε το σωματικό βάρος να μοιράζεται συμμετρικά και ξεκούραστα.',
    exercisesGreek: [
      'Βήμα 1 (3 λεπτά — Hip Hinge / Κίνηση Μεντεσέ Ισχίων): Με τα γόνατα ελάχιστα λυγισμένα και την πλάτη ολόισια, σπρώξε τη λεκάνη προς τα πίσω και ξανασήκω όρθιος σφίγγοντας τους γλουτούς (3 σετ των 12).',
      'Βήμα 2 (3.5 λεπτά — Όρθια Απαγωγή Ισχίου με Παύση): Στάσου όρθιος, σήκωσε το δεξί πόδι στο πλάι, κράτα 2 δευτερόλεπτα στην κορυφή και κατέβα αργά (2 σετ των 12 σε κάθε πόδι).',
      'Βήμα 3 (3.5 λεπτά — Ελεγχόμενο Split-Stance Κράτημα): Κάνε ένα μικρό βήμα μπροστά με το δεξί πόδι, λύγισε ελαφρά και τα δύο γόνατα (20%) και κράτα τη λεκάνη οριζόντια για 25". Άλλαξε πόδι (2 σετ).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 9,
    placeTags: ['living_room', 'bedroom_hotel', 'outdoor_park'],
    emotionTags: ['stiff_achy', 'energized_athletic'],
    attireTags: ['casual_home', 'pajamas_slippers', 'sportswear'],
  },

  // =========================================================================
  // Γ. ΠΡΩΤΟΚΟΛΛΑ ΡΕΥΜΑΤΟΛΟΓΩΝ (Rheumatology, Morning Stiffness & Synovial Flow)
  // =========================================================================
  {
    id: 'rheuma-morning-synovial-4',
    titleGreek: "4' Πρωτόκολλο Ρευματολόγου: Πρωινή Αφύπνιση Αρθρικού Υγρού (Όλο το Σώμα)",
    category: 'rheumatology_flow',
    categoryLabelGreek: 'Ρευματολόγοι (Πρωινή Ακαμψία & Αρθρώσεις)',
    modality: 'mobility',
    durationMins: 4,
    intensityLabel: '4 Λεπτά • Εξάλειψη Πρωινής Δυσκαμψίας • Μηδενική Πίεση',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Ρευματολόγου • Αρθρικό Υγρό',
    physiologyAndOrthopedicsGreek:
      'Ρευματολογία & Φυσιολογία Αρθρώσεων: Κατά την ακινησία ή τον ύπνο, το αρθρικό υγρό (το φυσικό λιπαντικό των αρθρώσεων) γίνεται πιο παχύρρευστο (θιξοτροπία). 4 λεπτά αργής, κυκλικής κίνησης χωρίς βάρος το ρευστοποιούν αμέσως και μειώνουν την πρωινή δυσκαμψία.',
    whatWeAchieveGreek:
      'Λιπαίνουμε απαλά όλες τις μικρές και μεγάλες αρθρώσεις (δάχτυλα, καρπούς, ώμους, γόνατα, αστραγάλους) ώστε να φύγει η πρωινή ακαμψία ή το μούδιασμα.',
    exercisesGreek: [
      'Βήμα 1 (1 λεπτό — Άκρα Χείρα & Καρποί): Άνοιξε διάπλατα τα δάχτυλα των χεριών και κλείσ’ τα απαλά σε γροθιά 12 φορές. Έπειτα κάνε 10 αργούς κύκλους με τους καρπούς.',
      'Βήμα 2 (1 λεπτό — Ώμοι & Αγκώνες): Ακούμπησε τα δάχτυλα στους ώμους σου και κάνε 10 αργούς, μεγάλους κύκλους με τους αγκώνες μπροστά και πίσω.',
      'Βήμα 3 (1 λεπτό — Λεκάνη & Γόνατα): Με τα πόδια στο άνοιγμα των ώμων, κάνε 8 αργούς κύκλους της λεκάνης δεξιά και 8 αριστερά, λυγίζοντας γλυκά τα γόνατα.',
      'Βήμα 4 (1 λεπτό — Ποδοκνημική & Δάχτυλα Ποδιών): Σήκωσε εναλλάξ τη δεξιά και την αριστερή φτέρνα από το έδαφος (σαν αργό πεντάλ) 20 φορές.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 3,
    placeTags: ['bedroom_hotel', 'living_room', 'small_space_2m', 'office'],
    emotionTags: ['stiff_achy', 'exhausted_heavy', 'bored_inertia'],
    attireTags: ['pajamas_slippers', 'casual_home', 'formal_office'],
  },
  {
    id: 'rheuma-antiinflammatory-flow-7',
    titleGreek: "7' Πρωτόκολλο Ρευματολόγου: Αντιφλεγμονώδης Ροή για Ευαίσθητες Μέρες",
    category: 'rheumatology_flow',
    categoryLabelGreek: 'Ρευματολόγοι (Πρωινή Ακαμψία & Αρθρώσεις)',
    modality: 'mobility',
    durationMins: 7,
    intensityLabel: '7 Λεπτά • Αντιφλεγμονώδης Κίνηση • 0% Κραδασμός',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Πρωτόκολλο Ρευματολόγου • Μείωση Φλεγμονής (IL-6 / CRP)',
    physiologyAndOrthopedicsGreek:
      'Ρευματολογία & Ανοσοφυσιολογία: Η ήπια, συνεχόμενη μυϊκή ροή χαμηλής έντασης απελευθερώνει αντιφλεγμονώδεις μυοκίνες (IL-10, IL-1ra) στην κυκλοφορία του αίματος, καταπραΰνοντας τον πόνο από υγρασία, κόπωση ή αυξημένη CRP.',
    whatWeAchieveGreek:
      'Κινούμε όλο το σώμα σαν «νερό» χωρίς κανένα απότομο τράβηγμα, μειώνοντας τη φλεγμονή και την ευαισθησία στις αρθρώσεις.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Αιώρηση Χεριών & Κορμού): Με τα πόδια ανοιχτά και τα γόνατα μαλακά, στρίψε τον κορμό δεξιά-αριστερά αφήνοντας τα χέρια τελείως χαλαρά να αιωρούνται γύρω από τη μέση.',
      'Βήμα 2 (2.5 λεπτά — Μεταφορά Βάρους Tai-Chi): Μετάφερε αργά το βάρος σου στο δεξί πόδι λυγίζοντάς το ελαφρά, ενώ ανοίγεις τα χέρια σαν φτερά. Μετάφερε αργά στο αριστερό πόδι.',
      'Βήμα 3 (2.5 λεπτά — Κύμα Σπονδυλικής Στήλης & Αναπνοή): Εισέπνευσε ανοίγοντας το στήθος μπροστά και εξέπνευσε στρογγυλεύοντας απαλά την πλάτη (10 αργές επαναλήψεις).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 5,
    placeTags: ['living_room', 'bedroom_hotel', 'small_space_2m'],
    emotionTags: ['stiff_achy', 'exhausted_heavy', 'stressed_anxious'],
    attireTags: ['pajamas_slippers', 'casual_home'],
  },

  // =========================================================================
  // Δ. ΕΙΔΙΚΟΙ ΓΥΜΝΑΣΤΕΣ ΑΘΛΗΜΑΤΩΝ (Track & Field, Swimming, Martial Arts, Trail)
  // =========================================================================
  {
    id: 'sport-track-running-economy-6',
    titleGreek: "6' Προπονητής Στίβου: Τεχνική «Ανάλαφρου Πατήματος» & Δρομική Οικονομία",
    category: 'sports_specialist',
    categoryLabelGreek: 'Ειδικοί Γυμναστές Αθλημάτων',
    modality: 'walk_run',
    durationMins: 6,
    intensityLabel: '6 Λεπτά • Τεχνική Δρομέα 5K • Χωρίς Εξοπλισμό',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Προπονητής Στίβου (Κλασικός Αθλητισμός)',
    physiologyAndOrthopedicsGreek:
      'Εμβιομηχανική Στίβου: Οι αρχάριοι κουράζονται επειδή κάνουν μεγάλα, βαριά βήματα μπροστά από το σώμα (overstriding), φρενάροντας σε κάθε βήμα! Τα μικρά, γρήγορα πατήματα κάτω από τη λεκάνη μειώνουν τον κραδασμό στα γόνατα κατά 35% και εξοικονομούν ενέργεια.',
    whatWeAchieveGreek:
      'Μαθαίνουμε το μυστικό των δρομέων αντοχής: πώς να κινούμαστε με μικρά, αθόρυβα και ξεκούραστα βήματα σαν ελατήριο.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Άσκηση A-March Στίβου): Περπάτα στη θέση σηκώνοντας το γόνατο με το πέλμα ενεργό (μύτη ποδιού ελαφρώς πάνω) και τους αγκώνες στις 90 μοίρες να κινούνται μπρος-πίσω.',
      'Βήμα 2 (2 λεπτά — Αθόρυβος Ρυθμός / Cadence Drill): Κάνε πολύ μικρά, γρήγορα και εντελώς ΑΘΟΡΥΒΑ βηματάκια στη θέση (σαν να πατάς σε αναμμένα κάρβουνα χωρίς να ακούγεται θόρυβος στο πάτωμα).',
      'Βήμα 3 (2 λεπτά — Ελατήριο Ποδοκνημικής & Στάση «Ψηλού Κορμού»): Νιώσε σαν ένα νήμα να σε τραβάει από την κορυφή του κεφαλιού ψηλά και περπάτα/τζόκαρε ανάλαφρα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 7,
    placeTags: ['living_room', 'outdoor_park', 'small_space_2m'],
    emotionTags: ['energized_athletic', 'bored_inertia'],
    attireTags: ['casual_home', 'sportswear', 'pajamas_slippers'],
  },
  {
    id: 'sport-swimming-dryland-8',
    titleGreek: "8' Γυμναστής Κολύμβησης (Dryland): Άνοιγμα Θώρακα, Οξυγόνωση & Πλάτη",
    category: 'sports_specialist',
    categoryLabelGreek: 'Ειδικοί Γυμναστές Αθλημάτων',
    modality: 'strength',
    durationMins: 8,
    intensityLabel: '8 Λεπτά • Χωρητικότητα Πνευμόνων & Δυνατή Πλάτη',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Προπονητής Κολύμβησης • Αναπνευστική Μηχανική',
    physiologyAndOrthopedicsGreek:
      'Αθλητική Φυσιολογία: Η «ξηρά προπόνηση» (Dryland) των κολυμβητών ανοίγει τον θωρακικό κλωβό, δυναμώνει τους μεσοπλεύριους αναπνευστικούς μύες και αυξάνει τον όγκο οξυγόνου σε κάθε ανάσα κατά το τρέξιμο.',
    whatWeAchieveGreek:
      'Ανοίγουμε τους ώμους και το στήθος, δυναμώνουμε την πλάτη και μαθαίνουμε να γεμίζουμε100% τους πνεύμονες ώστε να μη λαχανιάζουμε εύκολα.',
    exercisesGreek: [
      'Βήμα 1 (2.5 λεπτά — Όρθιο Streamline Τέντωμα Κολυμβητή): Ένωσε τις παλάμες ψηλά πάνω από το κεφάλι, κλείδωσε τους αγκώνες δίπλα στα αυτιά, σφίξε την κοιλιά και σήκω στις μύτες παίρνοντας βαθιά εισπνοή (10 φορές).',
      'Βήμα 2 (3 λεπτά — Όρθια «Πεταλούδα» & Πρόσθιο Πλάτης): Σκύψε ελάχιστα μπροστά με ίσια πλάτη, τέντωσε τα χέρια μπροστά και τράβα τα σε μεγάλο κύκλο προς τα πίσω σφίγγοντας τις ωμοπλάτες (2 σετ των 12).',
      'Βήμα 3 (2.5 λεπτά — Ρυθμική Αναπνοή Οξυγόνωσης): Περπάτα στη θέση εισπνέοντας για 3 βήματα από τη μύτη και εκπνέοντας δυνατά για 4 βήματα από το στόμα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 8,
    placeTags: ['living_room', 'bedroom_hotel', 'office', 'outdoor_park'],
    emotionTags: ['energized_athletic', 'stressed_anxious', 'stiff_achy'],
    attireTags: ['casual_home', 'pajamas_slippers', 'formal_office', 'sportswear'],
  },
  {
    id: 'sport-trail-mountaineering-12',
    titleGreek: "12' Γυμναστής Ορειβασίας & Trail: Δύναμη Τετρακεφάλων & Αντοχή Ανηφόρας",
    category: 'sports_specialist',
    categoryLabelGreek: 'Ειδικοί Γυμναστές Αθλημάτων',
    modality: 'strength',
    durationMins: 12,
    intensityLabel: '12 Λεπτά • Δύναμη Βουνού μέσα στο Σπίτι',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Ειδικός Ορειβασίας & Ορεινού Τρεξίματος (Trail)',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία Ορεινού Αθλητισμού: Οι ορειβάτες χτίζουν «ακούραστα» πόδια συνδυάζοντας έκκεντρη αντοχή τετρακεφάλων (για τις κατηφόρες) και δύναμη γλουτών/γάμπας (για τις ανηφόρες).',
    whatWeAchieveGreek:
      'Μετατρέπουμε τα πόδια σε «μηχανές ανηφόρας» ώστε οι σκάλες, οι ανηφόρες και τα 5 χιλιόμετρα να φαίνονται παιχνίδι.',
    exercisesGreek: [
      'Βήμα 1 (3 λεπτά — Βήμα Ορειβάτη με Ψηλό Γόνατο): Στάσου όρθιος, σήκωσε αργά το δεξί γόνατο ψηλά στο στήθος ενώ ταυτόχρονα σηκώνεσαι στη μύτη του αριστερού ποδιού. Επανάλαβε 20 φορές εναλλάξ.',
      'Βήμα 2 (4 λεπτά — Καθίσματα Αργού Ρυθμού 4-1-2): Κατέβα σε κάθισμα μετρώντας 4 δευτερόλεπτα (προσομοίωση κατηφόρας βουνού), μείνε 1" και ανέβα δυναμικά (3 σετ των 10).',
      'Βήμα 3 (5 λεπτά — Προβολές Σταθερότητας): Κάνε ένα βήμα πίσω σε προβολή, μείνε χαμηλά για 3 δευτερόλεπτα και έλα μπροστά σηκώνοντας το γόνατο ψηλά (2 σετ των 8 σε κάθε πόδι).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 12,
    placeTags: ['living_room', 'outdoor_park', 'bedroom_hotel'],
    emotionTags: ['energized_athletic'],
    attireTags: ['casual_home', 'sportswear'],
  },

  // =========================================================================
  // Ε. ΕΡΓΟΦΥΣΙΟΛΟΓΙΑ, ΣΑΚΧΑΡΟ, ΜΙΤΟΧΟΝΔΡΙΑ & ΝΕΥΡΙΚΟ ΣΥΣΤΗΜΑ (Physiology)
  // =========================================================================
  {
    id: 'physio-glucose-soleus-3',
    titleGreek: "3' Εργοφυσιολογία: «Αντλία Υποκνημίδιου Μυός» (Καύση Σακχάρου & Αδράνειας)",
    category: 'physiology_metabolism',
    categoryLabelGreek: 'Φυσιολογία (Σάκχαρο, Παλμοί & Στρες)',
    modality: 'mobility',
    durationMins: 3,
    intensityLabel: '3 Λεπτά • Μεταβολική Αφύπνιση • Ακόμα και με Παντόφλα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Κλινική Εργοφυσιολογία • Ρύθμιση Γλυκόζης',
    physiologyAndOrthopedicsGreek:
      'Εργοφυσιολογία: Ο υποκνημίδιος μυς (Soleus) στη γάμπα διαθέτει ειδικές οξειδωτικές ίνες που απορροφούν γλυκόζη και τριγλυκερίδια απευθείας από το αίμα χωρίς να απαιτούν ινσουλίνη (μέσω υποδοχέων GLUT-4), διώχνοντας αμέσως την υπνηλία!',
    whatWeAchieveGreek:
      'Ενεργοποιούμε τον πιο μεταβολικό μυ του σώματος μέσα σε 3 λεπτά — ιδανικό μετά το φαγητό ή όταν νιώθεις βαριεστημάρα στον καναπέ.',
    exercisesGreek: [
      'Βήμα 1 (1.5 λεπτό — Ρυθμική Αντλία Φτέρνας): Είτε όρθιος είτε ακόμα και στην άκρη του καναπέ/καρέκλας, κράτα τα δάχτυλα των ποδιών στο πάτωμα και ανέβαζε-κατέβαζε ρυθμικά τις φτέρνες σου ψηλά για 90 δευτερόλεπτα.',
      'Βήμα 2 (1.5 λεπτό — Όρθια Συσπείρωση Μηρών & Γλουτών): Σήκω όρθιος και κάνε 12 ήπια ημικαθίσματα συνδυάζοντας βαθιά εκπνοή σε κάθε ανέβασμα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 3,
    placeTags: ['living_room', 'office', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'exhausted_heavy'],
    attireTags: ['pajamas_slippers', 'formal_office', 'casual_home'],
  },
  {
    id: 'physio-vagus-cortisol-5',
    titleGreek: "5' Εργοφυσιολογία: Αποφόρτιση Πνευμονογαστρικού Νεύρου (Μείωση Στρες & Παλμών)",
    category: 'physiology_metabolism',
    categoryLabelGreek: 'Φυσιολογία (Σάκχαρο, Παλμοί & Στρες)',
    modality: 'mobility',
    durationMins: 5,
    intensityLabel: '5 Λεπτά • Ενεργοποίηση Παρασυμπαθητικού Συστήματος (HRV+)',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Νευροφυσιολογία • Vagus Nerve & HRV Reset',
    physiologyAndOrthopedicsGreek:
      'Νευροφυσιολογία: Ο «Φυσιολογικός Στεναγμός» (διπλή εισπνοή από τη μύτη + μακρά εκπνοή από το στόμα) σε συνδυασμό με ήπιο άνοιγμα του θώρακα διεγείρει το πνευμονογαστρικό νεύρο (Vagus Nerve), ρίχνει τους παλμούς ηρεμίας (RHR) και ανεβάζει το HRV μέσα σε 3 λεπτά.',
    whatWeAchieveGreek:
      'Σβήνουμε το άγχος, την υπερένταση και τη συναισθηματική πείνα, γυρνώντας το σώμα σε κατάσταση ηρεμίας και αποκατάστασης.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά — Φυσιολογικός Στεναγμός με Κίνηση Χεριών): Πάρε μία βαθιά εισπνοή από τη μύτη σηκώνοντας τα χέρια, πρόσθεσε μία δεύτερη μικρή εισπνοή στην κορυφή για να ανοίξουν τελείως οι πνεύμονες, και εξέπνευσε ΠΟΛΥ ΑΡΓΑ από το στόμα κατεβάζοντας τα χέρια (8 φορές).',
      'Βήμα 2 (1.5 λεπτό — Αποσυμπίεση Αυχένα & Διαφράγματος): Κάνε αργές στροφές ώμων πίσω και άφησε το σαγόνι και τους ώμους να χαλαρώσουν τελείως.',
      'Βήμα 3 (1.5 λεπτό — Αργό Ρυθμικό Βήμα Ηρεμίας): Περπάτα αργά στον χώρο συγχρονίζοντας 4 βήματα στην εισπνοή και 6 βήματα στην εκπνοή.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 4,
    placeTags: ['living_room', 'office', 'bedroom_hotel', 'small_space_2m'],
    emotionTags: ['stressed_anxious', 'exhausted_heavy'],
    attireTags: ['pajamas_slippers', 'formal_office', 'casual_home'],
  },
  {
    id: 'physio-zone2-mitochondria-12',
    titleGreek: "12' Εργοφυσιολογία Zone 2 (Σε 2m² Χώρο): Μιτοχόνδρια & Καύση Λίπους",
    category: 'physiology_metabolism',
    categoryLabelGreek: 'Φυσιολογία (Σάκχαρο, Παλμοί & Στρες)',
    modality: 'walk',
    durationMins: 12,
    intensityLabel: '12 Λεπτά • Zone 2 Μιτοχονδριακή Βάση • Σε 2m²',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Εργοφυσιολογία Αντοχής • Zone 2 (Μιτοχόνδρια)',
    physiologyAndOrthopedicsGreek:
      'Εργοφυσιολογία Αντοχής: Στη Ζώνη 2 (όπου μπορείς να μιλάς άνετα και αναπνέεις από τη μύτη), τα μυϊκά κύτταρα πολλαπλασιάζουν τα μιτοχόνδριά τους και χρησιμοποιούν το αποθηκευμένο λίπος ως κύριο καύσιμο, χτίζοντας τη βάση για τα 5km.',
    whatWeAchieveGreek:
      'Χτίζουμε καθαρή αερόβια αντοχή και καίμε λίπος μέσα σε μόλις 2 τετραγωνικά μέτρα χώρου, χωρίς κανένα άλμα.',
    exercisesGreek: [
      'Εκτέλεσε 3 συνεχόμενους κύκλους των 4 λεπτών (αναπνέοντας ήρεμα):',
      '1ο Λεπτό: Ζωηρό βήμα στη θέση κουνώντας ρυθμικά τους αγκώνες.',
      '2ο Λεπτό: Πλάγιο βήμα δεξιά-αριστερά (Step-Touch) ανοίγοντας και κλείνοντας τις ωμοπλάτες.',
      '3ο Λεπτό: Εναλλάξ άρση γονάτων μπροστά + εναλλάξ φτέρνες προς τους γλουτούς πίσω.',
      '4ο Λεπτό: Μικρό ημικάθισμα κάθε 4 βήματα στη θέση, διατηρώντας σταθερή, ξεκούραστη αναπνοή.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 10,
    placeTags: ['small_space_2m', 'living_room', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['casual_home', 'pajamas_slippers', 'sportswear'],
  },

  // =========================================================================
  // 1. ΓΡΑΦΕΙΟ / ΡΟΥΧΑ ΔΟΥΛΕΙΑΣ (Όρθιες, διακριτικές κινήσεις, μηδέν εξοπλισμός)
  // =========================================================================
  {
    id: 'office-standing-reset-2',
    titleGreek: "2' Όρθιο Ξεμπλοκάρισμα Μέσης & Ποδιών",
    category: 'office_clothes',
    categoryLabelGreek: 'Γραφείο (Ρούχα Δουλειάς)',
    modality: 'mobility',
    durationMins: 2,
    intensityLabel: '2 Λεπτά • Όρθιος • Χωρίς Ίδρωμα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Εργονομία Γραφείου • 2 Λεπτά',
    physiologyAndOrthopedicsGreek:
      'Εργονομία & Κυκλοφορικό: Επανεκκινεί τη φλεβική επιστροφή του αίματος από τα κάτω άκρα και αποφορτίζει τον λαγονοψοΐτη μυ.',
    whatWeAchieveGreek:
      'Όταν καθόμαστε, οι γοφοί «μαζεύουν» και τραβούν τη μέση, ενώ το αίμα μένει χαμηλά στα πόδια. Σε 2 λεπτά όρθιοι ανοίγουμε τη μέση και ξυπνάμε την κυκλοφορία του αίματος.',
    exercisesGreek: [
      'Βήμα 1 (1 λεπτό): Στάσου όρθιος και κάνε ένα μεγάλο βήμα πίσω με το δεξί πόδι. Λύγισε ελαφρά το μπροστινό γόνατο μέχρι να νιώσεις ένα γλυκό τέντωμα ψηλά στον δεξί γοφό. Μείνε 30 δευτερόλεπτα και άλλαξε πόδι.',
      'Βήμα 2 (30 δευτ.): Στάσου στα δύο πόδια και σήκω αργά στις μύτες των ποδιών 15 φορές (σαν να θες να δεις πάνω από έναν φράχτη).',
      'Βήμα 3 (30 δευτ.): Άνοιξε τα χέρια σου διάπλατα στο πλάι, τράβα τους ώμους πίσω και πάρε 5 βαθιές ανάσες.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 2,
    placeTags: ['office', 'small_space_2m'],
    emotionTags: ['stiff_achy', 'bored_inertia'],
    attireTags: ['formal_office', 'casual_home'],
  },
  {
    id: 'office-neck-shoulders-3',
    titleGreek: "3' Ανακούφιση Αυχένα, Ώμων & Πλάτης από την Οθόνη",
    category: 'office_clothes',
    categoryLabelGreek: 'Γραφείο (Ρούχα Δουλειάς)',
    modality: 'mobility',
    durationMins: 3,
    intensityLabel: '3 Λεπτά • Ξεκούραση από Υπολογιστή',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Εργονομία Οθόνης • Αυχένας & Ώμοι',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική Αυχένα: Αποκαθιστά την αιμάτωση στον τραπεζοειδή και στον ανελκτήρα της ωμοπλάτης μετά από πληκτρολόγηση.',
    whatWeAchieveGreek:
      'Διώχνουμε το βάρος από τον αυχένα και τους ώμους που καμπουριάζουν μπροστά στην οθόνη, ελευθερώνοντας την αναπνοή.',
    exercisesGreek: [
      'Βήμα 1 (1 λεπτό): Κάνε 10 μεγάλους, αργούς κύκλους με τους ώμους προς τα πίσω, αφήνοντάς τους να πέσουν χαμηλά.',
      'Βήμα 2 (1 λεπτό): Γείρε απαλά το κεφάλι προς τον δεξί ώμο (χωρίς να σηκώσεις τον ώμο) για 30 δευτερόλεπτα. Μετά προς τον αριστερό για 30 δευτερόλεπτα.',
      'Βήμα 3 (1 λεπτό): Σήκωσε τα χέρια ψηλά προς το ταβάνι, τέντωσε όλο το σώμα μια δεξιά και μια αριστερά σαν να ξυπνάς το πρωί.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 3,
    placeTags: ['office', 'living_room', 'small_space_2m'],
    emotionTags: ['stiff_achy', 'stressed_anxious'],
    attireTags: ['formal_office', 'casual_home', 'pajamas_slippers'],
  },
  {
    id: 'office-desk-strength-5',
    titleGreek: "5' Όρθιο Ξύπνημα Ποδιών & Ισορροπίας",
    category: 'office_clothes',
    categoryLabelGreek: 'Γραφείο (Ρούχα Δουλειάς)',
    modality: 'strength',
    durationMins: 5,
    intensityLabel: '5 Λεπτά • Με Ρούχα Γραφείου',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Ενεργοποίηση Κάτω Άκρων • Χωρίς Ίδρωμα',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία & Ορθοπεδική: Ξυπνά τους ιδιοδεκτικούς υποδοχείς της ποδοκνημικής και ενεργοποιεί την αντλία της γάμπας χωρίς να ανεβάσει τη θερμοκρασία του σώματος.',
    whatWeAchieveGreek:
      'Ενεργοποιούμε τους μηρούς, τις γάμπες και την ισορροπία των αστραγάλων όρθιοι στον χώρο μας, χωρίς να ιδρώσουμε.',
    exercisesGreek: [
      'Βήμα 1 (1.5 λεπτό): Μικρά Ημικαθίσματα — με τα πόδια ανοιχτά στο πλάτος των ώμων, λύγισε λίγο τα γόνατα (σαν να ξεκινάς να κάτσεις) και ξανασήκω όρθιος 12 φορές.',
      'Βήμα 2 (1.5 λεπτό): Αργό Ανέβασμα στις Μύτες — σήκω στις μύτες των ποδιών, κράτα για 2 δευτερόλεπτα στην κορυφή και κατέβα αργά (15 φορές).',
      'Βήμα 3 (1 λεπτό): Ισορροπία — σήκωσε ελαφρά το ένα πόδι από το έδαφος και κράτα ισορροπία στο άλλο πόδι για 30 δευτερόλεπτα. Άλλαξε πόδι.',
      'Βήμα 4 (1 λεπτό): Περπάτητησε ζωηρά στον χώρο για 1 λεπτό κουνώντας ελεύθερα τα χέρια.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 4,
    placeTags: ['office', 'living_room', 'small_space_2m'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['formal_office', 'casual_home'],
  },

  // =========================================================================
  // 2. ΣΠΙΤΙ ΜΕ ΠΑΝΤΟΦΛΑ / ΚΑΛΤΣΕΣ (100% χωρίς εξοπλισμό, ήπιες κινήσεις)
  // =========================================================================
  {
    id: 'home-slippers-2min',
    titleGreek: "2' Γρήγορο Ξεμούδιασμα στο Σπίτι (Με Παντόφλα ή Κάλτσες)",
    category: 'home_slippers',
    categoryLabelGreek: 'Σπίτι (Με Παντόφλα)',
    modality: 'mobility',
    durationMins: 2,
    intensityLabel: '2 Λεπτά • Πανεύκολο • Χωρίς Εξοπλισμό',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Zero-Friction • Σπάσιμο Αδράνειας Καναπέ',
    physiologyAndOrthopedicsGreek:
      'Νευροφυσιολογία Συμπεριφοράς: Μειώνει την τριβή έναρξης στο μηδέν, αυξάνοντας την ντοπαμίνη και την αιμάτωση των αρθρώσεων μέσα σε 120 δευτερόλεπτα.',
    whatWeAchieveGreek:
      'Ξεμουδιάζουμε αμέσως όλο το σώμα (μέση, γόνατα, ώμους) μέσα σε 2 λεπτά, όπως ακριβώς είμαστε ντυμένοι στο σπίτι.',
    exercisesGreek: [
      'Βήμα 1 (40 δευτ.): Περπάτημα στη Θέση — περπάτα επιτόπου σηκώνοντας χαλαρά τα γόνατα και κουνώντας τα χέρια.',
      'Βήμα 2 (40 δευτ.): 8 Ήπια Καθίσματα στον Αέρα — λύγισε λίγο τα γόνατα κρατώντας την πλάτη ίσια και σήκω ξανά όρθιος.',
      'Βήμα 3 (40 δευτ.): Άνοιγμα Στήθους & Τέντωμα Ψηλά — τέντωσε τα χέρια ψηλά παίρνοντας βαθιά εισπνοή από τη μύτη και κατέβασέ τα αργά εκπνέοντας.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 2,
    placeTags: ['living_room', 'bedroom_hotel', 'small_space_2m'],
    emotionTags: ['bored_inertia', 'exhausted_heavy'],
    attireTags: ['pajamas_slippers', 'casual_home'],
  },
  {
    id: 'home-slippers-joints-5',
    titleGreek: "5' Απαλή Κίνηση Όλων των Αρθρώσεων (Για Κάθε Ηλικία)",
    category: 'home_slippers',
    categoryLabelGreek: 'Σπίτι (Με Παντόφλα)',
    modality: 'mobility',
    durationMins: 5,
    intensityLabel: '5 Λεπτά • Εξαιρετικά Απαλό',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Ήπια Κινητικότητα 5–105 Ετών',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική Αρθρώσεων: Διεγείρει τον αρθρικό υμένα να εκκρίνει φρέσκο αρθρικό υγρό, θρέφοντας τον χόνδρο χωρίς μηχανική καταπόνηση.',
    whatWeAchieveGreek:
      '«Λαδώνουμε» όλες τις αρθρώσεις του σώματος από τους αστραγάλους μέχρι τους ώμους ώστε να φύγει η ακαμψία και το πιάσιμο.',
    exercisesGreek: [
      'Βήμα 1 (1 λεπτό): Αστράγαλοι — σήκωσε ελαφρά το δεξί πόδι και κάνε 10 κύκλους με το πέλμα δεξιά και 10 αριστερά. Κάνε το ίδιο με το αριστερό πόδι.',
      'Βήμα 2 (1.5 λεπτό): Γόνατα & Γοφοί — περπάτα αργά στη θέση σηκώνοντας το γόνατο λίγο πιο ψηλά σε κάθε βήμα (20 βήματα συνολικά).',
      'Βήμα 3 (1.5 λεπτό): Μέση — με τα πόδια ανοιχτά και τα χέρια στη μέση, κάνε 8 αργές, γλυκές στροφές του κορμού δεξιά-αριστερά.',
      'Βήμα 4 (1 λεπτό): Ώμοι & Χέρια — άνοιξε και κλείσε τα χέρια μπροστά στο στήθος (σαν να αγκαλιάζεις τον εαυτό σου) 12 φορές.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 3,
    placeTags: ['living_room', 'bedroom_hotel', 'small_space_2m'],
    emotionTags: ['stiff_achy', 'bored_inertia', 'exhausted_heavy'],
    attireTags: ['pajamas_slippers', 'casual_home'],
  },
  {
    id: 'home-slippers-sofa-8',
    titleGreek: "8' Δυνάμωμα Ποδιών & Γλουτών Όρθιος (Χωρίς Παπούτσια)",
    category: 'home_slippers',
    categoryLabelGreek: 'Σπίτι (Με Παντόφλα)',
    modality: 'strength',
    durationMins: 8,
    intensityLabel: '8 Λεπτά • Μηδενικός Κραδασμός',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Ενδυνάμωση με Κάλτσες / Παντόφλα',
    physiologyAndOrthopedicsGreek:
      'Εμβιομηχανική Πέλματος & Λεκάνης: Η άσκηση χωρίς παπούτσια ενεργοποιεί τους αυτόχθονες μύες της καμάρας του πέλματος μαζί με τον μέσο γλουτιαίο.',
    whatWeAchieveGreek:
      'Δυναμώνουμε τους μύες που στηρίζουν τα γόνατα και τη λεκάνη μόνο με το βάρος του σώματος, χωρίς να χρειαστεί να ξαπλώσουμε ή να βάλουμε αθλητικά.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά): Αργά Καθίσματα — με τα πόδια στο άνοιγμα των ώμων, κατέβα αργά (μέτρα 1-2-3) μέχρι τη μέση της διαδρομής και σήκω όρθιος σφίγγοντας τους γλουτούς (2 σετ των 10).',
      'Βήμα 2 (2 λεπτά): Πλάγιες Άρσεις Ποδιών Όρθιος — στάσου όρθιος και άνοιξε το δεξί πόδι τεντωμένο στο πλάι 12 φορές. Μετά το αριστερό 12 φορές. Δυναμώνει το πλάι της λεκάνης.',
      'Βήμα 3 (2 λεπτά): Δυνάμωμα Γάμπας — ανέβα αργά στις μύτες των ποδιών και κατέβα αργά 15 φορές (2 σετ).',
      'Βήμα 4 (2 λεπτά): Σταθερό Κράτημα Ημικαθίσματος — λύγισε λίγο τα γόνατα και μείνε ακίνητος για 20 δευτερόλεπτα. Ξεκουράσου 20" και επανάλαβε 2 φορές.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 7,
    placeTags: ['living_room', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'stiff_achy'],
    attireTags: ['pajamas_slippers', 'casual_home'],
  },
  {
    id: 'home-slippers-back-relief-10',
    titleGreek: "10' Ξεμπλοκάρισμα Μέσης, Πλάτης & Βαθιά Αναπνοή",
    category: 'home_slippers',
    categoryLabelGreek: 'Σπίτι (Με Παντόφλα)',
    modality: 'mobility',
    durationMins: 10,
    intensityLabel: '10 Λεπτά • Χαλάρωση & Ευεξία',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Βραδινή Αποφόρτιση & Εύπλαστη Μέση',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία Αποκατάστασης: Συνδυάζει πλάγια διάταση της θωρακοοσφυϊκής περιτονίας με παρασυμπαθητική αναπνοή 4-6 για βαθύ ύπνο.',
    whatWeAchieveGreek:
      'Ανακουφίζουμε τη μέση και την πλάτη από την κούραση της ημέρας και ρίχνουμε τους παλμούς της καρδιάς.',
    exercisesGreek: [
      'Βήμα 1 (2.5 λεπτά): Όρθιο Τέντωμα Πλευρών — σήκωσε το δεξί χέρι ψηλά και γείρε απαλά τον κορμό προς τα αριστερά για 20 δευτερόλεπτα. Άλλαξε πλευρά (3 φορές σε κάθε πλευρά).',
      'Βήμα 2 (2.5 λεπτά): Βήμα Πίσω & Άνοιγμα Γοφών — κάνε ένα βήμα πίσω με το δεξί πόδι, λύγισε ελαφρά το μπροστινό γόνατο και άνοιξε τα χέρια ψηλά για 30". Άλλαξε πόδι (2 φορές σε κάθε πόδι).',
      'Βήμα 3 (2.5 λεπτά): Χαλάρωση Μέσης — με τα γόνατα ελαφρώς λυγισμένα, άφησε τον κορμό και τα χέρια να κρεμάσουν χαλαρά προς τα κάτω για 20 δευτερόλεπτα και σήκω αργά.',
      'Βήμα 4 (2.5 λεπτά): Ήρεμη Αναπνοή — εισέπνευσε αργά από τη μύτη μετρώντας ως το 4 και εξέπνευσε αργά από το στόμα μετρώντας ως το 6.',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 4,
    placeTags: ['living_room', 'bedroom_hotel'],
    emotionTags: ['exhausted_heavy', 'stressed_anxious', 'stiff_achy'],
    attireTags: ['pajamas_slippers', 'casual_home'],
  },

  // =========================================================================
  // 3. ΠΟΔΙΑ, ΓΟΝΑΤΑ & ΜΕΣΗ (Προετοιμασία για Περπάτημα/Τρέξιμο χωρίς όργανα)
  // =========================================================================
  {
    id: 'home-achilles-knees-6',
    titleGreek: "6' Ασπίδα για Γόνατα & Αστραγάλους",
    category: 'tendon_core',
    categoryLabelGreek: 'Πόδια, Γόνατα & Μέση',
    modality: 'strength',
    durationMins: 6,
    intensityLabel: '6 Λεπτά • Προστασία Αρθρώσεων',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Θωράκιση Τενόντων Γόνατος & Ποδοκνημικής',
    physiologyAndOrthopedicsGreek:
      'Ορθοπεδική Προστασία: Οι ισομετρικές κρατήσεις αυξάνουν την ακαμψία και αντοχή των τενόντων χωρίς φθορά στις αρθρικές επιφάνειες.',
    whatWeAchieveGreek:
      'Δυναμώνουμε τους τένοντες στη γάμπα και γύρω από το γόνατο, ώστε όταν περπατάς ή τρέχεις να μην νιώθεις καμία ενόχληση.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά): Κράτημα στις Μύτες των Ποδιών — σήκω στις μύτες των ποδιών και μείνε εκεί ακίνητος για 25 δευτερόλεπτα. Ξεκουράσου 15" και κάνε το 3 φορές.',
      'Βήμα 2 (2 λεπτά): Κράτημα Ημικαθίσματος — λύγισε λίγο τα γόνατα (μόνο κατά το 1/3, όχι βαθιά) και μείνε ακίνητος για 25 δευτερόλεπτα. Ξεκουράσου 15" και κάνε το 3 φορές.',
      'Βήμα 3 (2 λεπτά): Περπάτημα στις Μύτες & στις Φτέρνες — περπάτα 20 βήματα ψηλά στις μύτες των ποδιών και μετά 20 βήματα πατώντας στις φτέρνες.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 6,
    placeTags: ['living_room', 'small_space_2m', 'outdoor_park'],
    emotionTags: ['stiff_achy', 'energized_athletic'],
    attireTags: ['casual_home', 'sportswear', 'pajamas_slippers'],
  },
  {
    id: 'home-tendon-armor-12',
    titleGreek: "12' Δυνατές Γάμπες, Μηροί & Γλουτοί (Ασπίδα Δρομέα)",
    category: 'tendon_core',
    categoryLabelGreek: 'Πόδια, Γόνατα & Μέση',
    modality: 'strength',
    durationMins: 12,
    intensityLabel: '12 Λεπτά • Δομική Δύναμη Ποδιών',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Δομική Ασπίδα Δρομέα 5K',
    physiologyAndOrthopedicsGreek:
      'Εμβιομηχανική Κρούσης: Ενδυναμώνει την τριπλή έκταση (αστράγαλος-γόνατο-ισχίο) ώστε οι μύες να λειτουργούν ως ενεργά αμορτισέρ.',
    whatWeAchieveGreek:
      'Χτίζουμε δυνατά πόδια που λειτουργούν σαν «αμορτισέρ» και απορροφούν τους κραδασμούς σε κάθε βήμα.',
    exercisesGreek: [
      'Βήμα 1 (3 λεπτά): Αργές Άρσεις Γάμπας — ανέβα στις μύτες σε 2 δευτερόλεπτα και κατέβα πολύ αργά μετρώντας 4 δευτερόλεπτα (3 σετ των 12 επαναλήψεων).',
      'Βήμα 2 (3 λεπτά): Καθίσματα — με τα πόδια στο άνοιγμα των ώμων, κατέβα ελεγχόμενα σαν να κάθεσαι και σήκω όρθιος (3 σετ των 12).',
      'Βήμα 3 (3 λεπτά): Βήμα Πίσω & Λύγισμα — κάνε ένα βήμα πίσω με το δεξί πόδι, λύγισε λίγο τα γόνατα και ξαναέλα μπροστά. Κάνε το ίδιο με το αριστερό (3 σετ των 8 σε κάθε πόδι).',
      'Βήμα 4 (3 λεπτά): Ισορροπία & Σταθερότητα — στάσου στο ένα πόδι με το γόνατο ελάχιστα λυγισμένο για 40 δευτερόλεπτα σε κάθε πλευρά (2 σετ).',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 10,
    placeTags: ['living_room', 'outdoor_park'],
    emotionTags: ['energized_athletic'],
    attireTags: ['casual_home', 'sportswear'],
  },
  {
    id: 'home-core-pelvis-15',
    titleGreek: "15' Δυνατή Μέση, Κοιλιά & Σταθερή Λεκάνη (Όρθιο Πρόγραμμα)",
    category: 'tendon_core',
    categoryLabelGreek: 'Πόδια, Γόνατα & Μέση',
    modality: 'strength',
    durationMins: 15,
    intensityLabel: '15 Λεπτά • Χωρίς Ξάπλωμα στο Πάτωμα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Όρθια Σταθεροποίηση Κορμού & Λεκάνης',
    physiologyAndOrthopedicsGreek:
      'Φυσιατρική Κορμού: Γυμνάζει τον εγκάρσιο κοιλιακό, τους λοξούς και τους ιερονωτιαίους σε όρθια λειτουργική θέση χωρίς κάμψη αυχένα.',
    whatWeAchieveGreek:
      'Γυμνάζουμε τους κοιλιακούς, τους ραχιαίους και τη λεκάνη εξ ολοκλήρου από όρθια θέση, χωρίς να πιέζουμε τον αυχένα ή τη μέση.',
    exercisesGreek: [
      'Βήμα 1 (4 λεπτά): Εναλλάξ Γόνατο-Αγκώνας Όρθιος — βάλε τα χέρια πίσω από το κεφάλι, σήκωσε το δεξί γόνατο και φέρε τον αριστερό αγκώνα να το πλησιάσει. Επανάλαβε εναλλάξ (3 σετ των 16).',
      'Βήμα 2 (4 λεπτά): Πλάγιες Άρσεις Γονάτου — σήκωσε το δεξί γόνατο από το πλάι προς τον δεξί ώμο σφίγγοντας τους πλάγιους κοιλιακούς (3 σετ των 10 σε κάθε πλευρά).',
      'Βήμα 3 (4 λεπτά): Καλημέρες (Κάμψεις Κορμού) — με ελαφρώς λυγισμένα γόνατα και ίσια πλάτη, γείρε τον κορμό μπροστά από τους γοφούς και ξανασήκω σφίγγοντας γλουτούς (3 σετ των 12).',
      'Βήμα 4 (3 λεπτά): Όρθιο Τέντωμα & Ισορροπία — τέντωσε τα χέρια ψηλά και σήκωσε εναλλάξ το ένα πόδι τεντωμένο πίσω κρατώντας ισορροπία (10 φορές σε κάθε πόδι).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 11,
    placeTags: ['living_room', 'bedroom_hotel', 'small_space_2m'],
    emotionTags: ['stiff_achy', 'energized_athletic'],
    attireTags: ['casual_home', 'pajamas_slippers', 'sportswear'],
  },

  // =========================================================================
  // 4. ΟΛΟΣΩΜΗ ΔΥΝΑΜΗ ΣΠΙΤΙΟΥ (100% χωρίς εξοπλισμό)
  // =========================================================================
  {
    id: 'home-easy-fullbody-10',
    titleGreek: "10' Εύκολη Ολόσωμη Ενδυνάμωση για Όλους (5-105 Ετών)",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Ολόσωμη Δύναμη',
    modality: 'strength',
    durationMins: 10,
    intensityLabel: '10 Λεπτά • Φιλικό για Όλες τις Ηλικίες',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Λειτουργική Μυϊκή Ενδυνάμωση 5–105 Ετών',
    physiologyAndOrthopedicsGreek:
      'Εργοφυσιολογία Μυϊκής Μάζας: Προστατεύει από τη σαρκοπενία (απώλεια μυών) και αυξάνει τον βασικό μεταβολισμό με ασφαλείς γωνίες αρθρώσεων.',
    whatWeAchieveGreek:
      'Ξυπνάμε όλους τους μύες του σώματος (πόδια, χέρια, πλάτη, κοιλιά) με απλές, ασφαλείς κινήσεις που δίνουν ενέργεια αμέσως.',
    exercisesGreek: [
      'Βήμα 1 (2.5 λεπτά): Ήπια Καθίσματα — κατεβαίνεις αργά μέχρι εκεί που νιώθεις άνετα και σηκώνεσαι (2 σετ των 10).',
      'Βήμα 2 (2.5 λεπτά): Άνοιγμα & Τράβηγμα Πλάτης — τέντωσε τα χέρια μπροστά και τράβα τους αγκώνες πίσω σφίγγοντας την πλάτη (2 σετ των 15).',
      'Βήμα 3 (2.5 λεπτά): Εναλλάξ Άρσεις Γονάτων — σήκωσε εναλλάξ δεξί και αριστερό γόνατο ψηλά κρατώντας την κοιλιά σφιχτή (2 σετ των 20 βημάτων).',
      'Βήμα 4 (2.5 λεπτά): Αργό Ανέβασμα στις Μύτες & Έκταση Χεριών Ψηλά — ανέβα στις μύτες σηκώνοντας ταυτόχρονα τα χέρια ψηλά (2 σετ των 12).',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 8,
    placeTags: ['living_room', 'bedroom_hotel', 'outdoor_park'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['casual_home', 'pajamas_slippers', 'sportswear'],
  },
  {
    id: 'home-calisthenics-circuit-15',
    titleGreek: "15' Ολόσωμη Γυμναστική Σπιτιού Χωρίς Όργανα",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Ολόσωμη Δύναμη',
    modality: 'strength',
    durationMins: 15,
    intensityLabel: '15 Λεπτά • Μυϊκή Τόνωση & Μεταβολισμός',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Κυκλική Καλλισθενική Ενδυνάμωση',
    physiologyAndOrthopedicsGreek:
      'Εργοφυσιολογία (Περιφερική Καρδιακή Δράση): Εναλλάσσει ασκήσεις άνω και κάτω κορμού ώστε η καρδιά να αιματώνει όλο το σώμα καίγοντας περισσότερες θερμίδες.',
    whatWeAchieveGreek:
      'Γυμνάζουμε όλο το σώμα αυξάνοντας τη δύναμη, τις καύσεις και την αντοχή μας μέσα στο σπίτι.',
    exercisesGreek: [
      'Κάνε 3 Κύκλους (40 δευτερόλεπτα κίνηση / 20 δευτερόλεπτα ανάσα σε κάθε άσκηση):',
      '1. Καθίσματα (Squats): Με τα πόδια στο άνοιγμα των ώμων, κατεβαίνεις και σηκώνεσαι με ίσια πλάτη.',
      '2. Βήματα Πίσω με Λύγισμα Ποδιών: Κάνεις ένα βήμα πίσω με το δεξί πόδι, λυγίζεις ελαφρά και αλλάζεις πόδι.',
      '3. Δυνάμωμα Ώμων & Πλάτης Όρθιος: Ανοίγεις τα χέρια στο πλάι και κάνεις μικρούς κύκλους και τραβήγματα ωμοπλατών.',
      '4. Όρθιοι Κοιλιακοί (Γόνατο με Αγκώνα): Ενώνεις εναλλάξ δεξί γόνατο με αριστερό αγκώνα.',
      '5. Ανέβασμα στις Μύτες των Ποδιών: Συνεχόμενες ρυθμικές άρσεις στις μύτες.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 12,
    placeTags: ['living_room', 'outdoor_park'],
    emotionTags: ['energized_athletic'],
    attireTags: ['casual_home', 'sportswear'],
  },
  {
    id: 'home-glute-legs-20',
    titleGreek: "20' Δυνατά Πόδια & Αντοχή για τα 5 Χιλιόμετρα",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Ολόσωμη Δύναμη',
    modality: 'strength',
    durationMins: 20,
    intensityLabel: '20 Λεπτά • Μυϊκή Αντοχή Ποδιών',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Μυϊκή Αντοχή Κάτω Άκρων 5K',
    physiologyAndOrthopedicsGreek:
      'Φυσιολογία Μυϊκών Ινών Τύπου Ι & ΙΙα: Χτίζει αντοχή στην κόπωση στους τετρακεφάλους, τους γλουτούς και τον γαστροκνήμιο για άνετο τερματισμό στα 5km.',
    whatWeAchieveGreek:
      'Δυναμώνουμε τους μηρούς, τους γλουτούς και τις γάμπες ώστε στα 5km τα πόδια σου να είναι ξεκούραστα και ανάλαφρα.',
    exercisesGreek: [
      'Βήμα 1 (5 λεπτά): Βαθιά Ελεγχόμενα Καθίσματα — 3 σετ των 12 επαναλήψεων με αργό κατέβασμα.',
      'Βήμα 2 (5 λεπτά): Προβολές Πίσω (Reverse Lunges) — βήμα πίσω και λύγισμα γονάτων, 3 σετ των 10 σε κάθε πόδι.',
      'Βήμα 3 (5 λεπτά): Πλάγια Βήματα σε Ημικάθισμα — με ελαφρώς λυγισμένα γόνατα, κάνε 10 βήματα δεξιά και 10 αριστερά (3 σετ).',
      'Βήμα 4 (5 λεπτά): Άρσεις Γάμπας με Ίσια & με Λυγισμένα Γόνατα — 2 σετ των 15 με ίσια γόνατα + 2 σετ των 15 με ελαφρώς λυγισμένα γόνατα.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 15,
    placeTags: ['living_room', 'outdoor_park'],
    emotionTags: ['energized_athletic'],
    attireTags: ['casual_home', 'sportswear'],
  },

  // =========================================================================
  // 5. ΑΕΡΟΒΙΟ ΣΠΙΤΙΟΥ ΧΩΡΙΣ ΑΛΜΑΤΑ (100% χωρίς εξοπλισμό & αθόρυβο)
  // =========================================================================
  {
    id: 'home-cardio-march-5',
    titleGreek: "5' Ζωηρό Ρυθμικό Βήμα στο Σαλόνι (Χωρίς Άλματα)",
    category: 'home_cardio',
    categoryLabelGreek: 'Αερόβιο Σπιτιού',
    modality: 'walk',
    durationMins: 5,
    intensityLabel: '5 Λεπτά • Αθόρυβο Αερόβιο',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Low-Impact Καρδιοαναπνευστική Αφύπνιση',
    physiologyAndOrthopedicsGreek:
      'Καρδιολογία & Ορθοπεδική: Αυξάνει τον όγκο παλμού της καρδιάς ενώ το ένα πόδι πατάει πάντα στο έδαφος, κρατώντας τους κραδασμούς κάτω από 1,2x του βάρους.',
    whatWeAchieveGreek:
      'Ανεβάζουμε παλμούς και ζεσταίνουμε όλο το σώμα μέσα στο δωμάτιο, χωρίς κανένα άλμα και χωρίς θόρυβο.',
    exercisesGreek: [
      'Βήμα 1 (2 λεπτά): Ζωηρό Βήμα στη Θέση — περπάτα ρυθμικά επιτόπου κουνώντας έντονα τα χέρια μπρος-πίσω.',
      'Βήμα 2 (2 λεπτά): Βήμα στο Πλάι — κάνε ένα βήμα δεξιά, ένωσε τα πόδια, μετά ένα βήμα αριστερά και ένωσε τα πόδια σε σταθερό ρυθμό.',
      'Βήμα 3 (1 λεπτό): Χαλαρό Βήμα & Βαθιές Ανάσες — ρίξε σταδιακά τον ρυθμό αναπνέοντας βαθιά.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 4,
    placeTags: ['living_room', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['pajamas_slippers', 'casual_home', 'sportswear'],
  },
  {
    id: 'home-cardio-dance-10',
    titleGreek: "10' Ρυθμική Αερόβια Κίνηση Σπιτιού (Καύση & Ευεξία)",
    category: 'home_cardio',
    categoryLabelGreek: 'Αερόβιο Σπιτιού',
    modality: 'walk',
    durationMins: 10,
    intensityLabel: '10 Λεπτά • Zone 2 στο Σπίτι',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Ρυθμική Αερόβια Κίνηση & Ενδορφίνες',
    physiologyAndOrthopedicsGreek:
      'Νευροφυσιολογία & Καρδιολογία: Η ρυθμική πολυεπίπεδη κίνηση αυξάνει την έκκριση ενδορφινών και βελτιώνει τον νευρομυϊκό συντονισμό.',
    whatWeAchieveGreek:
      'Βελτιώνουμε την αντοχή της καρδιάς και των πνευμόνων μέσα στο σπίτι με ευχάριστες, ρυθμικές εναλλαγές βημάτων.',
    exercisesGreek: [
      'Επανάλαβε 2 φορές τον παρακάτω κύκλο των 5 λεπτών:',
      '1ο Λεπτό: Ζωηρό περπάτημα στη θέση.',
      '2ο Λεπτό: Άνοιγμα ποδιού δεξιά-αριστερά σηκώνοντας ταυτόχρονα τα χέρια ψηλά (χωρίς να πηδάς).',
      '3ο Λεπτό: Εναλλάξ λύγισμα ποδιών πίσω (φέρνοντας τη φτέρνα προς τους γλουτούς).',
      '4ο Λεπτό: Εναλλάξ άρση γονάτων μπροστά σε ρυθμό παρέλασης.',
      '5ο Λεπτό: Ήρεμο βήμα στη θέση με βαθιές αναπνοές.',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 7,
    placeTags: ['living_room', 'small_space_2m', 'bedroom_hotel'],
    emotionTags: ['bored_inertia', 'energized_athletic'],
    attireTags: ['casual_home', 'pajamas_slippers', 'sportswear'],
  },
  {
    id: 'home-low-impact-metcon-15',
    titleGreek: "15' Πλήρες Αθόρυβο Αερόβιο στο Σαλόνι (Μηδέν Κραδασμοί)",
    category: 'home_cardio',
    categoryLabelGreek: 'Αερόβιο Σπιτιού',
    modality: 'mobility',
    durationMins: 15,
    intensityLabel: '15 Λεπτά • Αερόβια Αντοχή Χωρίς Άλματα',
    equipmentGreek: 'Κανένας εξοπλισμός',
    specialistBadgeGreek: 'Αθόρυβη Μεταβολική Προπόνηση Σπιτιού',
    physiologyAndOrthopedicsGreek:
      'Εργοφυσιολογία Καύσης: Συνδυάζει μεγάλες μυϊκές ομάδες σε συνεχή ροή Zone 2, μεγιστοποιώντας την καύση λιπαρών οξέων με μηδενική κρούση στις αρθρώσεις.',
    whatWeAchieveGreek:
      'Καίμε θερμίδες και χτίζουμε αερόβια αντοχή επιπέδου γρήγορου περπατήματος χωρίς να βγούμε έξω και χωρίς να επιβαρύνουμε τα γόνατα.',
    exercisesGreek: [
      'Κάνε 3 Κύκλους (45 δευτερόλεπτα κίνηση / 15 δευτερόλεπτα ανάσα):',
      '1. Πλάγια Βήματα με Χέρια Ψηλά: Ανοίγεις το δεξί πόδι στο πλάι σηκώνοντας τα χέρια ψηλά (χωρίς αναπήδηση) και μετά το αριστερό.',
      '2. Ζωηρό Βήμα στη Θέση: Σηκώνεις ρυθμικά τα γόνατα κουνώντας έντονα τα χέρια.',
      '3. Μικρό Κάθισμα & Τέντωμα Ψηλά: Λυγίζεις λίγο τα γόνατα και καθώς σηκώνεσαι τεντώνεις τα χέρια προς το ταβάνι.',
      '4. Δύο Βήματα Δεξιά - Δύο Βήματα Αριστερά: Μετακινήσου ρυθμικά δεξιά και αριστερά στον χώρο.',
      '5. Φτέρνες Πίσω: Λυγίζεις εναλλάξ τα πόδια πίσω φέρνοντας τη φτέρνα προς τους γλουτούς.',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 10,
    placeTags: ['living_room', 'small_space_2m'],
    emotionTags: ['energized_athletic', 'bored_inertia'],
    attireTags: ['casual_home', 'sportswear'],
  },
];
