import type { Item, Outcome, Role, SkillId, Stage, TaskType, UnitId } from '../content/schema';
import type { Evaluation } from './evaluate';
import type { SegmentSize } from './config';

export type SupportKind = 'hint' | 'why' | 'difference' | 'example' | 'translation' | 'scaffold' | 'model';
export type HelpKind = 'hint' | 'why' | 'difference' | 'example' | 'translation';
export type SlotRole = 'calibration' | 'review' | 'focus' | 'mixed' | 'dialogue' | 'exit';
export type ReportReason = 'more_than_one' | 'unclear' | 'seems_wrong' | 'other';

export type ReasonCode =
  | 'calibration'
  | 'first_segment'
  | 'due_review'
  | 'probe_prior'
  | 'focus_continue'
  | 'focus_new'
  | 'bridge_need'
  | 'recheck_after_error'
  | 'neighbor_mix'
  | 'focus_contrast'
  | 'exit_check'
  | 'dialogue'
  | 'familiar_review'
  | 'content_exhausted';

export interface RetentionInfo {
  eligible: boolean;
  /** why it is (not) an eligible delayed check */
  why: string;
  hoursSinceTeach: number | null;
  stepBefore: number;
  stepAfter: number;
}

export interface AttemptRecord {
  attemptId: string;
  segmentId: string;
  appSession: string;
  slotIndex: number;
  slotRole: SlotRole;
  reason: ReasonCode;
  itemId: string;
  itemVersion: number;
  contentVersion: string;
  turn: number | null;
  skill: SkillId;
  unit: UnitId;
  sub: string;
  ctx: string;
  fam: string;
  type: TaskType;
  role: Role;
  stage: Stage;
  kind: 'main' | 'repair';
  attemptNo: number;
  firstAttempt: boolean;
  /** first time this item (and turn) was ever attempted */
  firstEver: boolean;
  /** the item had been shown before this segment (familiar review) */
  familiar: boolean;
  shownAt: number;
  submittedAt: number;
  answer: string[];
  answerText: string;
  supportBeforeSubmit: SupportKind[];
  feedbackShown: boolean;
  outcome: Outcome;
  errorType: string | null;
  evalSource: string;
  /** the item offered a ready Hebrew sentence to express */
  hebrewPrompt: boolean;
  /** repair made right after the solution was shown */
  assisted: boolean;
  retention: RetentionInfo | null;
  /** excluded from progress metrics (reported as problematic, pending review) */
  excluded: boolean;
  reportReason: ReportReason | null;
}

export interface RetentionEvent {
  at: number;
  hours: number;
  ok: boolean;
  stepBefore: number;
  stepAfter: number;
  itemId: string;
}

export interface UnitState {
  unit: UnitId;
  lessonShownAt: number | null;
  /** last time the correct form of this unit was shown (feedback, lesson, hint, example…) */
  lastTeachAt: number | null;
  /** retention step index into CONFIG.intervalsDays; -1 = not scheduled yet */
  step: number;
  dueAt: number | null;
  lastAdvanceDay: string | null;
  focusSegments: number;
  lastFocusAt: number | null;
  retention: RetentionEvent[];
}

export interface Exposure {
  itemId: string;
  firstAt: number;
  lastAt: number;
  count: number;
  /** segments in which the item appeared */
  segments: string[];
}

export interface BuildState {
  /** token ids placed in the answer line, in order */
  answer: string[];
  /** insertion position 0..answer.length, or null = at the end */
  caret: number | null;
  /** the caret was placed explicitly and follows insertions (otherwise it is one-shot) */
  sticky: boolean;
  /** seed for the stable bank order */
  seed: number;
  /** previous answer states for step-by-step undo */
  history?: string[][];
}

export type Phase = 'explain' | 'task' | 'feedback' | 'repair' | 'summary';

export interface Slot {
  role: SlotRole;
  itemId: string | null;
  turn: number | null;
  unit: UnitId | null;
  reason: ReasonCode | null;
  status: 'pending' | 'active' | 'done' | 'skipped';
  outcome: Outcome | null;
  familiar: boolean;
}

export interface CurrentTask {
  slotIndex: number;
  /** snapshot of the item as shown — an app update never changes it under an active attempt */
  item: Item;
  turn: number | null;
  shownAt: number;
  attemptNo: number;
  build: BuildState | null;
  choice: string[] | null;
  /** support used before the (current) submission */
  support: SupportKind[];
  /** help panel currently open */
  help: HelpKind | null;
  /** feedback detail expanded */
  deepOpen: boolean;
  lastEval: Evaluation | null;
  /** the answer (token ids / option ids) of the last submission */
  lastAnswer: string[] | null;
  mainOutcome: Outcome | null;
  /** in repair: the model sentence is visible */
  modelVisible: boolean;
  /** after the repairs ran out, the model was demonstrated */
  demonstrated: boolean;
  familiar: boolean;
  firstEver: boolean;
}

export interface SegmentSummary {
  segmentId: string;
  kind: ActiveSegment['kind'];
  size: SegmentSize;
  focusUnit: UnitId | null;
  startedAt: number;
  endedAt: number;
  completed: boolean;
  endedEarlyReason: 'stopped' | 'content_exhausted' | null;
  tasksDone: number;
  tasksPlanned: number;
  practiced: { unit: UnitId; count: number }[];
  firstTry: { unit: UnitId; ok: number; total: number; example: string | null }[];
  toCheck: { unit: UnitId; why: 'errors' | 'scheduled'; dueAt: number | null }[];
  difficulty: 'too_easy' | 'fits' | 'too_hard' | null;
  askDifficulty: boolean;
}

export interface ActiveSegment {
  segmentId: string;
  rev: number;
  kind: 'calibration' | 'first' | 'regular';
  size: SegmentSize;
  focusUnit: UnitId | null;
  reason: ReasonCode;
  createdAt: number;
  updatedAt: number;
  slots: Slot[];
  index: number;
  phase: Phase;
  /** lesson shown when phase === 'explain' */
  explainUnit: UnitId | null;
  /** slot index before which the explanation is inserted (-1 = none) */
  explainBefore: number;
  explainDone: boolean;
  current: CurrentTask | null;
  pendingRechecks: { unit: UnitId; notBefore: number }[];
  /** units taught (solution/hint/lesson shown) earlier in this segment */
  taughtUnits: UnitId[];
  dialogue: { itemId: string; turn: number; prevAcceptIndex: number | null } | null;
  summary: SegmentSummary | null;
}

export interface Profile {
  createdAt: number;
  onboardingDone: boolean;
  calibration: 'pending' | 'done' | 'skipped';
  calibrationResults: Partial<Record<UnitId, Outcome>>;
  firstSegmentDone: boolean;
  segmentsCompleted: number;
  currentFocus: UnitId | null;
  promotedUnits: UnitId[];
  /** remaining segments in which a bridge unit should be woven in */
  bridgeNeeds: Partial<Record<UnitId, number>>;
  /** units to re-check at the next opportunity (errors not re-checked before a segment ended) */
  recheckNext: UnitId[];
  difficultyBias: -1 | 0 | 1;
  persistRequested: boolean;
}

export interface Settings {
  textSize: 'normal' | 'large' | 'larger';
  theme: 'system' | 'light' | 'dark';
  defaultSize: SegmentSize;
  /** hide the token bank until tapped, to leave room to form the sentence first */
  thinkFirst: boolean;
}

export interface ReportRecord {
  reportId: string;
  at: number;
  itemId: string;
  itemVersion: number;
  turn: number | null;
  reason: ReportReason;
  attemptIds: string[];
  answerText: string | null;
  status: 'open' | 'reviewed';
}

export interface EventRecord {
  id: string;
  at: number;
  type:
    | 'segment_started'
    | 'segment_completed'
    | 'segment_paused'
    | 'segment_ended_early'
    | 'help_used'
    | 'report'
    | 'save_failed'
    | 'difficulty';
  data: Record<string, string | number | boolean | null>;
}

export interface Snapshot {
  profile: Profile;
  settings: Settings;
  units: Record<UnitId, UnitState>;
  attempts: AttemptRecord[];
  exposures: Record<string, Exposure>;
  active: ActiveSegment | null;
  segments: SegmentSummary[];
  reports: ReportRecord[];
  events: EventRecord[];
}

/** A set of writes produced by one engine step; committed atomically by the storage layer. */
export interface Change {
  profile?: Profile;
  settings?: Settings;
  units?: UnitState[];
  attempts?: AttemptRecord[];
  exposures?: Exposure[];
  /** undefined = unchanged; null = cleared */
  active?: ActiveSegment | null;
  segments?: SegmentSummary[];
  reports?: ReportRecord[];
  events?: EventRecord[];
}
