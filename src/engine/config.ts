import type { UnitId } from '../content/schema';

/**
 * Tunable product defaults. None of these numbers is a proven optimum — they are planning
 * defaults (spec §9) kept in one place so they can be calibrated and tested.
 */
export const CONFIG = {
  /** spaced-review intervals, in days, per step */
  intervalsDays: [1, 3, 7, 14, 30] as const,
  /** steps to go back after a failed eligible delayed check */
  lapseStepBack: 2,
  /** minimum hours since the last teaching exposure for a delayed check to count */
  retentionMinHours: 20,
  /** a due unit may be checked this many hours before its due time */
  dueToleranceHours: 4,
  /** advancement: of the last `window` unassisted first-attempt build opportunities … */
  advance: { window: 5, minSuccess: 4, minContexts: 2, minTaskTypes: 2, minSituationNoHebrew: 1 },
  /** main tasks per segment size */
  segmentSizes: { short: 6, regular: 14, deep: 24 } as const,
  /** a re-check after an error comes this many tasks later (min) */
  recheckGap: 3,
  /** maximum repair attempts after the main attempt */
  maxRepairs: 2,
  /** soft cap: segments with the same focus before moving on (the unit stays in review) */
  maxFocusSegments: 4,
  /** distinct review units at the opening of a segment */
  reviewUnitsAtOpening: 2,
  /** ask "too easy / fits / too hard" after every N completed segments */
  difficultyPromptEvery: 3,
  /** a failed probe of a known unit twice in its last 3 attempts promotes it to a teaching focus */
  promoteAfterFailures: 2,
  /** days after which a previously seen item or family is cooled down and eligible for spaced retrieval */
  itemCooldownDays: 14,
  /** import/backup limits */
  maxBackupBytes: 15 * 1024 * 1024,
} as const;

export type SegmentSize = keyof typeof CONFIG.segmentSizes;

/** Order in which units become the teaching focus (spec §5). */
export const FOCUS_ORDER: readonly UnitId[] = [
  'S03',
  'S04',
  'S05',
  'S06',
  'S12',
  'S08',
  'S09',
  'S07',
  'S10',
  'S11.used_to',
  'S11.would',
  'S11.be_used_to',
  'S11.get_used_to',
  'S02',
  'S01',
];

/** Units that were taught before and are probed as spaced review, in this order. */
export const PROBE_ORDER: readonly UnitId[] = [
  'S08',
  'S09',
  'S07',
  'S06',
  'S05',
  'S04',
  'S10',
  'S01',
  'S02',
  'S11.used_to',
  'S11.be_used_to',
  'S11.get_used_to',
  'S11.would',
];

/** Bridge units are never a full focus while their parent is taught; they enter as short bridges. */
export const BRIDGE_UNITS: readonly UnitId[] = ['S01', 'S02'];

/** Error types that signal a need for a bridge unit. */
export const BRIDGE_BY_ERROR: Readonly<Record<string, UnitId>> = {
  missing_be: 'S01',
  be_agreement: 'S01',
  be_base: 'S01',
  have_base: 'S02',
  v2_for_v3: 'S02',
  have_went: 'S02',
  wrong_participle: 'S02',
};

/** Slot templates per segment size. `explain` is inserted by the planner when needed. */
export const SLOT_TEMPLATES = {
  short: ['review', 'focus', 'focus', 'mixed', 'dialogue', 'exit'],
  regular: [
    'review', 'review',
    'focus', 'focus', 'focus', 'focus',
    'mixed', 'mixed', 'mixed', 'mixed',
    'dialogue', 'dialogue',
    'exit', 'exit',
  ],
  deep: [
    'review', 'review',
    'focus', 'focus', 'focus', 'focus', 'focus', 'focus',
    'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed',
    'dialogue', 'dialogue', 'dialogue', 'dialogue',
    'exit', 'exit',
  ],
} as const;

/** The scripted first segment (spec §10): preferred items per slot role, in order. */
export const FIRST_SEGMENT_PREFS = {
  review: ['S01-01', 'S03-01'],
  reviewShort: ['S03-01'],
  focus: ['S03-02', 'S03-03', 'S04-01', 'S03-04'],
  mixed: ['S06-01', 'S06-02', 'S05-01'],
  dialogue: ['S03-D1'],
  exit: ['S03-C1', 'S03-C2'],
} as const;
