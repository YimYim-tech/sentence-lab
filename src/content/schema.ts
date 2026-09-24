/**
 * Content schema for Sentence Lab.
 *
 * Every learning item is data. The engine never asks a language model whether an
 * answer is right: an answer is judged only by what the item itself declares
 * (accepted answers, known wrong answers, rules and distractor reasons). Anything
 * the item does not cover is reported as `unverified` — never silently as wrong.
 *
 * Text conventions (Hebrew strings):
 *  - Wrap every English fragment inside Hebrew text in backticks: "אחרי `have` בא `been`".
 *    The UI renders it as an isolated left-to-right span.
 *  - A line starting with "• " renders as a bullet; "\n" separates paragraphs.
 */

export type SkillId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06'
  | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12';

/** A learning unit is what progress and spacing are tracked on. Most skills have one unit
 *  (unit id === skill id). S11 is split into four distinct units. */
export type UnitId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10'
  | 'S11.used_to' | 'S11.would' | 'S11.be_used_to' | 'S11.get_used_to'
  | 'S12';

export type Outcome =
  | 'correct_target'     // correct and uses the structure being practised
  | 'valid_alternative'  // correct, fits the task, different acceptable wording
  | 'target_not_used'    // grammatical and meaningful, but avoids the structure the task asked for
  | 'meaning_mismatch'   // grammatical, but says something other than the situation requires
  | 'form_error'         // grammatical form error established by the item's own rules
  | 'unverified'         // not covered by the item: never counted as wrong
  | 'skipped';

/** Outcomes an authored rule / known-wrong answer / distractor may assign. */
export type RuledOutcome = 'form_error' | 'meaning_mismatch' | 'target_not_used';

export type TaskType = 'assemble' | 'correct' | 'transform' | 'discriminate' | 'dialogue';

/**
 * Support stage (scaffolding fades as the stage rises):
 *  1 = supported: Hebrew sentence to express and/or the structure chain shown (`scaffold`)
 *  2 = situation: build from a situation, no model shown
 *  3 = contrast: choose or build between close structures
 */
export type Stage = 1 | 2 | 3;

/** practice = normal pool; check = reserved for exit/retention checks and never shown before
 *  as an example or correction; calibration = one of the four opening calibration tasks. */
export type Role = 'practice' | 'check' | 'calibration';

export interface Token {
  /** unique inside the item (source + bank together) */
  id: string;
  /** display text: lower case unless it is `I` or a proper noun; no punctuation */
  t: string;
  /** Distractor reason (Hebrew). REQUIRED for every token that appears in no accepted answer.
   *  Shown when the token is used in an answer that is not accepted and no rule matched first,
   *  so it must be true whenever this token is used in a non-accepted answer. */
  why?: string;
  /** error type key for analytics (required together with `why`) */
  err?: string;
  /** outcome for the distractor (default form_error) */
  as?: RuledOutcome;
}

export interface Accepted {
  /** sentence as space separated words, no final punctuation. Compared case-insensitively. */
  a: string;
  o: 'correct_target' | 'valid_alternative' | 'target_not_used';
  /** Hebrew note shown with this answer (recommended for alternatives / target_not_used) */
  note?: string;
}

export interface KnownWrong {
  /** exact wrong sentence (normalised like Accepted.a) */
  a: string;
  as: RuledOutcome;
  err: string;
  fb: string;
}

/**
 * A rule classifies a non-accepted answer. All given conditions must hold.
 * Each entry of has/lacks/order is a word or a contiguous phrase ("have working").
 * Matching is on whole words, case-insensitive.
 * A rule must never match any accepted answer (the validator enforces this).
 */
export interface Rule {
  has?: string[];
  lacks?: string[];
  order?: string[];
  starts?: string;
  ends?: string;
  as: RuledOutcome;
  err: string;
  fb: string;
}

export interface BuildSpec {
  /** assemble / dialogue: the whole bank (answer pieces + distractors).
   *  correct / transform: the EXTRA bank offered on top of the given sentence. */
  tokens: Token[];
  accept: Accepted[];
  wrong?: KnownWrong[];
  rules?: Rule[];
  /** punctuation appended automatically to the built sentence (never judged) */
  end: '.' | '?' | '!';
  /** optional English text shown before the built part (e.g. the first half of a sentence,
   *  "I sent the email yesterday,"). When present the built part is not capitalised. */
  lead?: string;
}

export interface ItemBase {
  id: string;
  v: number;
  skill: SkillId;
  unit: UnitId;
  /** subskill tag, e.g. 'affirmative', 'question', 'negative', 'contrast' */
  sub: string;
  type: TaskType;
  role: Role;
  stage: Stage;
  /** context family, e.g. 'work.report' — see CONTEXT_FAMILIES */
  ctx: string;
  /** variant family: items that differ only by a substitution share it */
  fam: string;
  /** short communicative goal in Hebrew ("לספר כמה זמן אתה כבר עובד על הדוח") */
  goal: string;
  /** Hebrew instruction ("בנה את המשפט באנגלית") */
  instr: string;
  /** Hebrew sentence the learner should express (translation-style prompt) */
  promptHe?: string;
  /** Hebrew description of a situation (not a sentence to translate) */
  sitHe?: string;
  /** English situation (advanced); requires trHe */
  sitEn?: string;
  /** Hebrew translation of sitEn; showing it is logged as support 'translation' */
  trHe?: string;
  /** required structure, stated BEFORE the attempt (Hebrew). If present, a correct answer
   *  that avoids it is target_not_used, never an error. */
  target?: string;
  /** grammar hint (Hebrew). Showing it before submitting is logged as support 'hint'. */
  hint: string;
  /** short explanation (≤ 2 sentences, Hebrew) shown with feedback */
  explain: string;
  /** optional deeper explanation (Hebrew), opened on tap */
  deep?: string;
  /** optional "what is the difference?" contrast (Hebrew) */
  diff?: string;
  /** structure chain shown as scaffolding (stage 1 only), e.g. ['have / has', 'been', 'V-ing'] */
  scaffold?: string[];
}

export interface AssembleItem extends ItemBase, BuildSpec {
  type: 'assemble';
}

export interface CorrectItem extends ItemBase, BuildSpec {
  type: 'correct';
  /** the given sentence, in order. May already be correct ("no correction needed"). */
  source: Token[];
}

export interface TransformItem extends ItemBase, BuildSpec {
  type: 'transform';
  /** the original sentence, in order; pre-filled in the answer line */
  source: Token[];
  sourceEnd: '.' | '?';
  /** Hebrew labels: from → to, e.g. 'שאלה ישירה' → 'שאלה עקיפה' */
  fromLabel: string;
  toLabel: string;
}

export interface ChoiceOption {
  id: string;
  /** full English sentence including punctuation */
  en: string;
  /** fits = correct for the situation; other_meaning = grammatical but wrong for the situation;
   *  ungrammatical = form error */
  v: 'fits' | 'other_meaning' | 'ungrammatical';
  /** Hebrew explanation, specific to this option (required for every option) */
  why: string;
  err?: string;
}

export interface DiscriminateItem extends ItemBase {
  type: 'discriminate';
  /** true = "choose all that fit" (use when more than one option fits) */
  multi: boolean;
  options: ChoiceOption[];
}

export interface PartnerLine {
  en: string;
  he: string;
}

export interface DialogueTurn {
  /** what the partner says before this turn. For turns after the first, `variants` may
   *  replace it depending on which accepted answer (index in the previous turn's accept list)
   *  the learner built. A variant must keep the story facts and must not reveal this turn's answer. */
  partner: PartnerLine;
  variants?: { ifPrev: number[]; line: PartnerLine }[];
  /** the unit this turn practises, when it differs from the dialogue's unit */
  unit?: UnitId;
  sub?: string;
  instr: string;
  goal?: string;
  target?: string;
  hint: string;
  explain: string;
  build: BuildSpec;
}

export interface DialogueItem extends ItemBase {
  type: 'dialogue';
  partnerName: string;
  /** Hebrew scene setting */
  setupHe: string;
  turns: DialogueTurn[];
  closing?: PartnerLine;
}

export type Item = AssembleItem | CorrectItem | TransformItem | DiscriminateItem | DialogueItem;
export type BuildItem = AssembleItem | CorrectItem | TransformItem;

export interface Example {
  en: string;
  he: string;
  /** optional Hebrew note */
  note?: string;
}

/** Explanation card for a unit (shown once when the unit becomes the focus; always reachable). */
export interface Lesson {
  unit: UnitId;
  title: string;
  /** ≤ 2 sentences */
  short: string;
  /** structure chain, e.g. ['have / has', 'been', 'V-ing'] */
  chain?: string[];
  examples: Example[];
  contrast?: { a: Example; b: Example; note: string };
  /** longer explanation, opened on tap */
  deep: string;
  pitfalls?: string[];
}

export interface SkillPack {
  skill: SkillId;
  lessons: Lesson[];
  /** extra examples for the "another example" help button, per unit */
  examples: Partial<Record<UnitId, Example[]>>;
  items: Item[];
}

export const CONTEXT_FAMILIES = {
  'work.report': 'דוחות ומסמכים בעבודה',
  'work.email': 'דוא"ל והתכתבות',
  'work.meeting': 'פגישות והחלטות',
  'work.schedule': 'שינויי מועד ולוחות זמנים',
  'work.software': 'תוכנה ומערכות',
  'work.clinic': 'עבודה במרפאה (בלי פרטי מטופלים)',
  'work.municipality': 'עבודה בעירייה',
  'work.project': 'פרויקטים וצוות',
  'work.job': 'מקום עבודה ותפקיד',
  'daily.home': 'בית ומגורים',
  'daily.family': 'משפחה וחברים',
  'daily.travel': 'נסיעות ותחבורה',
  'daily.health': 'ספורט ובריאות',
  'daily.shopping': 'קניות ושירות',
  'daily.learning': 'לימודים ואנגלית',
  'daily.food': 'אוכל ובישול',
  'daily.past': 'זיכרונות והרגלים מהעבר',
} as const;

export type ContextFamily = keyof typeof CONTEXT_FAMILIES;
