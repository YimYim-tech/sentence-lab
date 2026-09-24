import type { SkillId, UnitId } from './schema';

/**
 * What is known from the earlier ChatGPT lessons. This is a PRIORITY record, not measured
 * evidence: it never creates attempts, success rates or retention dates.
 */
export interface PriorRecord {
  sourceDate: string; // ISO date of the source conversation
  evidenceType: 'transcript_error' | 'transcript_success' | 'lesson_topic' | 'confusion';
  /** whether it is unknown how much help preceded the sentence */
  supportUnknown: boolean;
  /** learning sentence (non-identifying) */
  example?: string;
  noteHe: string;
}

export interface UnitMeta {
  id: UnitId;
  skill: SkillId;
  code: string; // S03 BE_PROGRESSIVE-style code
  nameHe: string;
  labelEn: string;
  /** why this unit matters for this learner (Today screen reason) */
  whyHe: string;
  /** 'deepening' = met before in the lessons; 'new' = not taught before */
  prior: 'taught' | 'encountered' | 'none';
  priorRecords: PriorRecord[];
  /** related units used for bridges and interleaving */
  neighbors: UnitId[];
  /** transition sentence when this unit becomes the focus */
  bridgeHe?: string;
}

export const UNITS: readonly UnitMeta[] = [
  {
    id: 'S01',
    skill: 'S01',
    code: 'BE_PROGRESSIVE',
    nameHe: 'מה קורה עכשיו',
    labelEn: 'am / is / are + -ing',
    whyHe: 'המילה `am / is / are` נשמטת לפעמים לפני פועל עם ing.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-18',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'I still working there.',
        noteHe: 'חסר פועל העזר לפני working.',
      },
    ],
    neighbors: ['S03', 'S02'],
    bridgeHe: 'לפני שממשיכים: רגע על החוליה הראשונה בשרשרת — `am / is / are` לפני פועל עם ing.',
  },
  {
    id: 'S02',
    skill: 'S02',
    code: 'PERFECT_CHAIN',
    nameHe: 'עד עכשיו: have / has + V3',
    labelEn: 'have / has + past participle',
    whyHe: 'זו החוליה שעליה נבנים גם `have been working` וגם `has been approved`.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-17',
        evidenceType: 'lesson_topic',
        supportUnknown: true,
        noteHe: 'תורגלו already / yet / still.',
      },
    ],
    neighbors: ['S06', 'S03', 'S12'],
    bridgeHe: 'גשר קצר: `have / has` + צורת V3 — הבסיס של כל מבני ה-perfect.',
  },
  {
    id: 'S03',
    skill: 'S03',
    code: 'PERFECT_CONTINUOUS_CHAIN',
    nameHe: 'כבר זמן מה: have been + ing',
    labelEn: 'have / has + been + -ing',
    whyHe: 'נתרגל את המילים הקטנות שחסרות לפעמים בין הנושא לפועל.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-23',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'I have working on the report for two hours.',
        noteHe: 'חסר been בין have לבין working.',
      },
      {
        sourceDate: '2026-09-23',
        evidenceType: 'transcript_success',
        supportUnknown: true,
        example: "I've been working here for three years.",
        noteHe: 'הצליח, לא ידוע כמה סיוע קדם לכך.',
      },
    ],
    neighbors: ['S01', 'S02', 'S05', 'S04'],
  },
  {
    id: 'S04',
    skill: 'S04',
    code: 'HOW_LONG_QUESTIONS',
    nameHe: 'לשאול כמה זמן',
    labelEn: 'How long have you been + -ing?',
    whyHe: 'בשאלה, `have` עובר לפני הנושא — וקל לשכוח את `been`.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-23',
        evidenceType: 'lesson_topic',
        supportUnknown: true,
        noteHe: 'תורגלו שאלות How long, עם הצלחות וגם סיוע.',
      },
    ],
    neighbors: ['S03', 'S05', 'S07'],
    bridgeHe: 'עד עכשיו סיפרנו כמה זמן משהו נמשך. עכשיו נשאל על זה: `have` עובר לפני הנושא.',
  },
  {
    id: 'S05',
    skill: 'S05',
    code: 'FOR_SINCE',
    nameHe: 'for או since',
    labelEn: 'for + period / since + starting point',
    whyHe: 'משך הזמן (`for`) ונקודת ההתחלה (`since`) — בתוך משפט שלם.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-23',
        evidenceType: 'transcript_success',
        supportUnknown: true,
        example: "I've lived here since 2023.",
        noteHe: 'הצליח, לא ידוע כמה סיוע קדם לכך.',
      },
    ],
    neighbors: ['S03', 'S04', 'S02'],
    bridgeHe: 'עכשיו נבחין בין כמה זמן (`for`) לבין ממתי (`since`).',
  },
  {
    id: 'S06',
    skill: 'S06',
    code: 'PAST_VS_PERFECT',
    nameHe: 'אתמול מול עד עכשיו',
    labelEn: 'past simple vs present perfect',
    whyHe: 'כשמציינים זמן עבר שהסתיים (`yesterday`) — עבר פשוט, גם אם יש קשר להווה.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-17',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: "I've sent the report yesterday.",
        noteHe: 'present perfect עם ציון זמן עבר מוגמר.',
      },
    ],
    neighbors: ['S02', 'S03', 'S07'],
    bridgeHe: 'עד עכשיו דיברנו על מה שנמשך עד היום. עכשיו נבחין בינו לבין מה שקרה בזמן מוגדר שכבר עבר.',
  },
  {
    id: 'S07',
    skill: 'S07',
    code: 'DO_BASE',
    nameHe: 'do / does / did + צורת בסיס',
    labelEn: 'do / does / did + base verb',
    whyHe: 'אחרי `did` או `does` הפועל חוזר לצורת הבסיס.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-07',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'Who did you invited?',
        noteHe: 'תוקן ל-Who did you invite? לאחר סיוע.',
      },
    ],
    neighbors: ['S09', 'S10', 'S08'],
  },
  {
    id: 'S08',
    skill: 'S08',
    code: 'INDIRECT_ORDER',
    nameHe: 'שאלה עקיפה',
    labelEn: 'Could you tell me when it starts?',
    whyHe: 'בתוך שאלה עקיפה הסדר חוזר להיות כמו במשפט רגיל, בלי `do / does`.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-09',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'Could you tell me when does it take effect?',
        noteHe: 'היפוך של שאלה ישירה בתוך שאלה עקיפה.',
      },
    ],
    neighbors: ['S07', 'S09', 'S04'],
    bridgeHe: 'נחזור לשאלות — הפעם שאלות מנומסות, שבתוכן הסדר חוזר להיות כמו במשפט רגיל.',
  },
  {
    id: 'S09',
    skill: 'S09',
    code: 'SUBJECT_OBJECT',
    nameHe: 'מי הזמין? את מי הזמנת?',
    labelEn: 'Who invited you? / Who did you invite?',
    whyHe: 'שתי שאלות שנראות דומות ושואלות דברים הפוכים.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-07',
        evidenceType: 'lesson_topic',
        supportUnknown: true,
        noteHe: 'נלמדו שאלות נושא ומושא; דווח שהנושא עדיין לא יושב.',
      },
    ],
    neighbors: ['S07', 'S08'],
    bridgeHe: 'עכשיו נבחין בין שאלה על מי שעשה את הפעולה לבין שאלה על מי שקיבל אותה.',
  },
  {
    id: 'S10',
    skill: 'S10',
    code: 'MODAL_BASE',
    nameHe: 'must / can / would + צורת בסיס',
    labelEn: 'modal + base verb',
    whyHe: 'אחרי `must`, `can`, `could`, `would` בא פועל בסיס — בלי `to` ובלי סיומת.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-07',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'I must to go.',
        noteHe: 'to מיותר אחרי must.',
      },
      {
        sourceDate: '2026-09-06',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'We would visited.',
        noteHe: 'תוקן ל-would visit.',
      },
    ],
    neighbors: ['S07', 'S11.would'],
  },
  {
    id: 'S11.used_to',
    skill: 'S11',
    code: 'HABIT_MEANING / used to',
    nameHe: 'used to — פעם, וכבר לא',
    labelEn: 'used to + base verb',
    whyHe: 'הרגל או מצב בעבר שכבר לא נכון היום.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-06',
        evidenceType: 'lesson_topic',
        supportUnknown: true,
        noteHe: 'נלמד בשיעור מלא — אין צורך ללמד מחדש מההתחלה.',
      },
    ],
    neighbors: ['S11.would', 'S11.be_used_to', 'S10'],
  },
  {
    id: 'S11.would',
    skill: 'S11',
    code: 'HABIT_MEANING / would',
    nameHe: 'would — פעולה שחזרה בעבר',
    labelEn: 'would + base verb (past habit)',
    whyHe: '`would` מתאר פעולה שחזרה בעבר — אבל לא מצב.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-06',
        evidenceType: 'transcript_error',
        supportUnknown: true,
        example: 'We would visited.',
        noteHe: 'תוקן ל-would visit.',
      },
    ],
    neighbors: ['S11.used_to', 'S10'],
  },
  {
    id: 'S11.be_used_to',
    skill: 'S11',
    code: 'HABIT_MEANING / be used to',
    nameHe: 'be used to — רגיל ל…',
    labelEn: 'be used to + -ing / noun',
    whyHe: 'רגיל למשהו — אחרי `to` בא שם עצם או פועל עם ing.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-06',
        evidenceType: 'transcript_success',
        supportUnknown: true,
        example: "I'm used to working.",
        noteHe: 'הצליח, לא ידוע כמה סיוע קדם לכך.',
      },
    ],
    neighbors: ['S11.get_used_to', 'S11.used_to'],
  },
  {
    id: 'S11.get_used_to',
    skill: 'S11',
    code: 'HABIT_MEANING / get used to',
    nameHe: 'get used to — מתרגל ל…',
    labelEn: 'get used to + -ing / noun',
    whyHe: 'תהליך של התרגלות — לא מצב קבוע.',
    prior: 'taught',
    priorRecords: [
      {
        sourceDate: '2026-09-06',
        evidenceType: 'transcript_success',
        supportUnknown: true,
        example: "I'm getting used to working.",
        noteHe: 'הצליח, לא ידוע כמה סיוע קדם לכך.',
      },
    ],
    neighbors: ['S11.be_used_to', 'S11.used_to'],
  },
  {
    id: 'S12',
    skill: 'S12',
    code: 'ACTIVE_PASSIVE',
    nameHe: 'מי אישר, ומה אושר',
    labelEn: 'has approved / has been approved',
    whyHe: 'אותן מילים (`has been`), מבנה אחר: סביל — מה קיבל את הפעולה.',
    prior: 'encountered',
    priorRecords: [
      {
        sourceDate: '2026-09-23',
        evidenceType: 'confusion',
        supportUnknown: true,
        example: 'The change has been approved.',
        noteHe: 'הופיע באמצע תרגול של have been working, בלי הסבר על המעבר — ונוצר בלבול.',
      },
    ],
    neighbors: ['S02', 'S03'],
    bridgeHe:
      'עד עכשיו שאלנו על משך פעולה ועל מי שעושה אותה. כעת נבחין בין מי שמבצע את הפעולה לבין מה שקיבל אותה: `The manager has approved the change` מול `The change has been approved`.',
  },
];

export const UNIT_BY_ID: Readonly<Record<UnitId, UnitMeta>> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
) as Record<UnitId, UnitMeta>;

export const UNITS_BY_SKILL: Readonly<Record<SkillId, UnitId[]>> = UNITS.reduce(
  (acc, u) => {
    (acc[u.skill] ??= []).push(u.id);
    return acc;
  },
  {} as Record<SkillId, UnitId[]>,
);

/** Topics from the original course map. Shown as a map only — no practice exists for them yet. */
export const EXPANSION_MAP: readonly { he: string; en: string }[] = [
  { he: 'עבר מתמשך ועבר מושלם', en: 'past continuous / past perfect' },
  { he: 'דרכים לדבר על העתיד', en: 'will / going to / present continuous' },
  { he: 'to או ing אחרי פועל', en: 'infinitive / -ing' },
  { he: 'ניסוח שינוי מועד', en: 'rescheduling language' },
  { he: 'a / the ומילות יחס בהקשר', en: 'articles and prepositions in context' },
  { he: 'משפטי תנאי', en: 'conditionals' },
  { he: 'דיבור עקיף', en: 'reported speech' },
  { he: 'משפטי זיקה', en: 'relative clauses' },
];
