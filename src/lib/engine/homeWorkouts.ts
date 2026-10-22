import { ModalityType } from '@/types/kinesis';

export type HomeWorkoutCategory =
  | 'zero_friction'
  | 'tendon_core'
  | 'calisthenics_strength'
  | 'home_cardio';

export interface HomeWorkoutProtocol {
  id: string;
  titleGreek: string;
  category: HomeWorkoutCategory;
  categoryLabelGreek: string;
  modality: ModalityType;
  durationMins: number;
  intensityLabel: string;
  equipmentGreek: string;
  reasoningGreek: string;
  exercisesGreek: string[];
  habitPointsAward: number;
  structuralPointsAward: number;
}

export const HOME_WORKOUT_CATEGORY_LABELS: Record<HomeWorkoutCategory, string> = {
  zero_friction: 'Γρήγορη Αφύπνιση (2-6 λεπτά)',
  tendon_core: 'Θωράκιση Τενόντων & Κορμού',
  calisthenics_strength: 'Σωματική Εκγύμναση (Full-Body)',
  home_cardio: 'Αερόβιο Σπιτιού Χωρίς Κραδασμούς',
};

export const HOME_WORKOUT_PROTOCOLS: HomeWorkoutProtocol[] = [
  {
    id: 'home-desk-reset-4',
    titleGreek: "4' Αποσυμπίεση Καρέκλας & Ενεργοποίηση Γλουτών",
    category: 'zero_friction',
    categoryLabelGreek: 'Γρήγορη Αφύπνιση',
    modality: 'mobility',
    durationMins: 4,
    intensityLabel: 'Zero-Friction • Με Ρούχα Γραφείου',
    equipmentGreek: 'Καρέκλα Γραφείου',
    reasoningGreek:
      'Αντιστρέφει την αναστολή των γλουτών και το βράχυνση του λαγονοψοΐτη από την πολύωρη καθιστική θέση.',
    exercisesGreek: [
      '60" Διατάσεις καμπτήρων ισχίου όρθιος δίπλα στο γραφείο (30" ανά πλευρά)',
      '60" 10 αργά Sit-to-Stand (κάθισμα και έγερση από την καρέκλα χωρίς χέρια)',
      '60" Θωρακικές εκτάσεις & κύκλοι ώμων με βαθιά διαφραγματική εκπνοή',
      '60" 15 άρσεις φτερνών (Calf Raises) όρθιος για ενεργοποίηση φλεβικής επιστροφής',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 3,
  },
  {
    id: 'home-isometric-achilles-6',
    titleGreek: "6' Ισομετρική Ασπίδα Αχιλλείου & Επιγονατίδας",
    category: 'zero_friction',
    categoryLabelGreek: 'Γρήγορη Αφύπνιση',
    modality: 'strength',
    durationMins: 6,
    intensityLabel: 'Αναλγητική Φόρτιση Τενόντων',
    equipmentGreek: 'Τοίχος',
    reasoningGreek:
      'Οι ισομετρικές κρατήσεις μειώνουν τον πόνο στους τένοντες και αυξάνουν την ακαμψία του Αχιλλείου πριν το τρέξιμο.',
    exercisesGreek: [
      '3 x 30" Ισομετρική κράτηση στις μύτες των ποδιών (Single ή Double Leg Calf Hold)',
      '3 x 30" Ισομετρικό κάθισμα στον τοίχο (Wall Sit στις 60° κάμψης γονάτων)',
      '60" Κινητικότητα ποδοκνημικής (γονάτισμα προς τον τοίχο χωρίς να σηκωθεί η φτέρνα)',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 6,
  },
  {
    id: 'home-tendon-armor-12',
    titleGreek: "12' Δομική Θωράκιση Δρομέα (Αχίλλειος, Γλουτοί & Πέλμα)",
    category: 'tendon_core',
    categoryLabelGreek: 'Θωράκιση Τενόντων & Κορμού',
    modality: 'strength',
    durationMins: 12,
    intensityLabel: 'Δομική Ανοχή • Προστασία Αρθρώσεων',
    equipmentGreek: 'Χωρίς εξοπλισμό / Σκαλοπάτι',
    reasoningGreek:
      'Χτίζει την ικανότητα απορρόφησης κραδασμών (έως 3x του σωματικού βάρους σε κάθε διασκελισμό).',
    exercisesGreek: [
      '3 σετ x 12 Αργές εκκεντρικές άρσεις γάμπας (3" ανέβασμα, 4" κατέβασμα)',
      '3 σετ x 10 Γέφυρες γλουτών (Glute Bridges) με παύση 2" στην κορυφή',
      '2 σετ x 8 ανά πόδι Split Squats (προβολές στη θέση) με ελεγχόμενο ρυθμό',
      '2 σετ x 30" Σανίδα (Front Plank) με ενεργή σύσφιξη κορμού',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 10,
  },
  {
    id: 'home-core-pelvis-15',
    titleGreek: "15' Σταθεροποίηση Λεκάνης & Αντι-Περιστροφικός Κορμός",
    category: 'tendon_core',
    categoryLabelGreek: 'Θωράκιση Τενόντων & Κορμού',
    modality: 'strength',
    durationMins: 15,
    intensityLabel: 'Έλεγχος Κέντρου Βάρους • Δρομική Οικονομία',
    equipmentGreek: 'Χαλί ή Πετσέτα',
    reasoningGreek:
      'Σταθερή λεκάνη σημαίνει μηδενική διαρροή ενέργειας και προστασία της μέσης και της λαγονοκνημιαίας ταινίας (IT Band).',
    exercisesGreek: [
      '3 σετ x 10 Dead Bugs (αργή εναλλαγή αντίθετου χεριού-ποδιού με τη μέση κολλημένη στο έδαφος)',
      '3 σετ x 10 Bird-Dogs (τετραποδική θέση, έκταση αντίθετου χεριού-ποδιού με παύση 2")',
      '3 σετ x 25" Πλάγια Σανίδα (Side Plank) στα γόνατα ή στις μύτες ανά πλευρά',
      '3 σετ x 12 Clamshells ή πλάγιες άρσεις ποδιού για μέσο γλουτιαίο',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 11,
  },
  {
    id: 'home-calisthenics-circuit-15',
    titleGreek: "15' Ολοκληρωμένη Καλλισθενική Κυκλική Σπιτιού (Full-Body)",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Σωματική Εκγύμναση (Full-Body)',
    modality: 'strength',
    durationMins: 15,
    intensityLabel: 'Zone 2 Δύναμης • Μυϊκή Τόνωση & Μεταβολισμός',
    equipmentGreek: 'Χωρίς εξοπλισμό',
    reasoningGreek:
      'Ιδανική όταν βαριέσαι το μονότονο περπάτημα. Ενεργοποιεί μεγάλες μυϊκές ομάδες αυξάνοντας την ευαισθησία στην ινσουλίνη.',
    exercisesGreek: [
      '3 Κύκλοι (40" εκτέλεση / 20" ξεκούραση ανά άσκηση):',
      '1. Bodyweight Squats (Βαθιά καθίσματα με έλεγχο)',
      '2. Κάμψεις (Push-ups σε πάγκο/καναπέ ή στο έδαφος)',
      '3. Εναλλάξ Οπίσθιες Προβολές (Reverse Lunges)',
      '4. Κωπηλατική Πλάτης Πρηνής (Prone Y-T-W Lifts στο πάτωμα)',
      '5. Σανίδα στους πήχεις ή Mountain Climbers χαμηλού ρυθμού',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 12,
  },
  {
    id: 'home-glute-legs-20',
    titleGreek: "20' Δύναμη Κάτω Άκρων & Αντοχή Τετρακεφάλων (Runner's Legs)",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Σωματική Εκγύμναση (Full-Body)',
    modality: 'strength',
    durationMins: 20,
    intensityLabel: 'Μυϊκή Αντοχή • Προετοιμασία 5K',
    equipmentGreek: 'Καρέκλα ή Καναπές',
    reasoningGreek:
      'Θωρακίζει τα πόδια ώστε στα τελευταία 2 χιλιόμετρα του 5K να μην καταρρέει η μηχανική του διασκελισμού.',
    exercisesGreek: [
      '3 σετ x 10 Bulgarian Split Squats (το πίσω πόδι σε καρέκλα/καναπέ) ή απλά Split Squats',
      '3 σετ x 12 Single-Leg Romanian Deadlifts (μονοποδικές άρσεις θανάτου ισορροπίας)',
      '3 σετ x 15 Step-Ups σε σταθερό σκαλοπάτι ή χαμηλό σκαμπό',
      '3 σετ x 15 Άρσεις γαστροκνημίου με λυγισμένα γόνατα (στόχευση υποκνημίδιου μυός - Soleus)',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 15,
  },
  {
    id: 'home-upper-posture-12',
    titleGreek: "12' Άνω Κορμός, Ώμοι & Ανοικτός Θώρακας (Posture Builder)",
    category: 'calisthenics_strength',
    categoryLabelGreek: 'Σωματική Εκγύμναση (Full-Body)',
    modality: 'strength',
    durationMins: 12,
    intensityLabel: 'Στάση Σώματος • Ελεύθερη Αναπνοή',
    equipmentGreek: 'Τοίχος / Λάστιχο ή Πετσέτα',
    reasoningGreek:
      'Ανοίγει τον θωρακικό κλωβό μετά το πληκτρολόγιο ώστε οι πνεύμονες να έχουν μέγιστο όγκο εισπνοής στο τρέξιμο.',
    exercisesGreek: [
      '3 σετ x 10 Wall Angels (ολίσθηση χεριών στον τοίχο με επαφή ωμοπλατών)',
      '3 σετ x 10 Κάμψεις (Incline Push-ups ή κλασικές)',
      '3 σετ x 12 Τραβήγματα πετσέτας (Isometric Towel Rows) για ενεργοποίηση ρομβοειδών',
      '2 λεπτά Διατάσεις θωρακικών μυών στην κάσα της πόρτας',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 8,
  },
  {
    id: 'home-low-impact-metcon-15',
    titleGreek: "15' Αερόβια Κυκλική Σπιτιού Χωρίς Άλματα (Zero-Jump Cardio)",
    category: 'home_cardio',
    categoryLabelGreek: 'Αερόβιο Σπιτιού Χωρίς Κραδασμούς',
    modality: 'mobility',
    durationMins: 15,
    intensityLabel: 'Zone 2 • Αθόρυβη Αερόβια Ροή στο Σαλόνι',
    equipmentGreek: 'Χωρίς εξοπλισμό (Αθόρυβο για διαμέρισμα)',
    reasoningGreek:
      'Ανεβάζει καρδιακή συχνότητα σε Zone 2 μέσα στο σπίτι χωρίς κανέναν κραδασμό ή θόρυβο στο πάτωμα.',
    exercisesGreek: [
      '3 Κύκλοι συνεχόμενης ροής (45" κίνηση / 15" αναπνοή):',
      '1. Step-Jacks (Πλάγια βήματα με άρση χεριών πάνω από το κεφάλι χωρίς αναπήδηση)',
      '2. Shadow Boxing ή Ρυθμικό March στη θέση με ψηλά γόνατα',
      '3. Squat to Reach (Ημικάθισμα και ανάταση στις μύτες των ποδιών)',
      '4. Πλάγια βήματα (Lateral Skater Steps) χαμηλού κέντρου βάρους',
      '5. Good Mornings (κάμψεις ισχίων με τα χέρια πίσω από το κεφάλι)',
    ],
    habitPointsAward: 15,
    structuralPointsAward: 10,
  },
  {
    id: 'home-stairs-interval-10',
    titleGreek: "10' Διαλειμματική Ανάβαση Σκάλας Πολυκατοικίας",
    category: 'home_cardio',
    categoryLabelGreek: 'Αερόβιο Σπιτιού Χωρίς Κραδασμούς',
    modality: 'stairs',
    durationMins: 10,
    intensityLabel: 'Zone 2 • Υψηλό Καρδιοαναπνευστικό Κέρδος',
    equipmentGreek: 'Κλιμακοστάσιο',
    reasoningGreek:
      'Η ανάβαση σκάλας χτίζει τεράστια ομόκεντρη δύναμη τετρακεφάλων και VO2max με ελάχιστο κραδασμό προσγείωσης.',
    exercisesGreek: [
      '2 λεπτά Προθέρμανση: Αργή ανάβαση & κατάβαση 1 ορόφου',
      '6 λεπτά Κύριο Μέρος: Σταθερή ρυθμική ανάβαση (έμφαση στο πάτημα με όλο το πέλμα), πολύ χαλαρή κατάβαση',
      '2 λεπτά Αποθεραπεία: Διατάσεις γαστροκνημίου στο πρώτο σκαλοπάτι',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 9,
  },
  {
    id: 'home-mobility-flow-10',
    titleGreek: "10' Βραδινή Αποσυμπίεση Σπονδυλικής Στήλης & Ισχίων",
    category: 'zero_friction',
    categoryLabelGreek: 'Γρήγορη Αφύπνιση',
    modality: 'mobility',
    durationMins: 10,
    intensityLabel: 'Παρασυμπαθητική Ενεργοποίηση • Πριν τον Ύπνο',
    equipmentGreek: 'Χαλί ή Στρώμα',
    reasoningGreek:
      'Ρίχνει τους παλμούς ηρεμίας (RHR) και βελτιώνει το σκορ ύπνου για την επόμενη μέρα.',
    exercisesGreek: [
      '2 λεπτά Cat-Cow (Κίνηση σπονδυλικής στήλης σε τετραποδική θέση)',
      '3 λεπτά 90/90 Hip Switches (Εσωτερική & εξωτερική στροφή ισχίων καθιστός)',
      '3 λεπτά Child’s Pose με πλάγιες διατάσεις πλατύ ραχιαίου',
      '2 λεπτά Ύπτια διαφραγματική αναπνοή (4" εισπνοή από τη μύτη / 6" εκπνοή)',
    ],
    habitPointsAward: 14,
    structuralPointsAward: 4,
  },
];
