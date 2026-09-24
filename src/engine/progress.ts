import type { TaskType, UnitId } from '../content/schema';
import { CONFIG } from './config';
import { isFailure, isSuccess } from './evaluate';
import type { AttemptRecord, RetentionEvent, SupportKind, UnitState } from './types';

export type UnitStatus = 'not_checked' | 'practicing' | 'constrained_success' | 'checked_after_interval';

export const STATUS_HE: Readonly<Record<UnitStatus, string>> = {
  not_checked: 'טרם נבדקה',
  practicing: 'מתרגלים',
  constrained_success: 'הצלחה בתרגול מוגבל',
  checked_after_interval: 'נבדקה לאחר מרווח',
};

export const BUILD_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(['assemble', 'correct', 'transform', 'dialogue']);

/** Support that gives away grammar (translation alone does not). */
export const GRAMMAR_SUPPORT: ReadonlySet<SupportKind> = new Set<SupportKind>([
  'hint',
  'why',
  'difference',
  'example',
  'scaffold',
  'model',
]);

export function usedGrammarSupport(support: readonly SupportKind[]): boolean {
  return support.some((s) => GRAMMAR_SUPPORT.has(s));
}

/** A counted opportunity for constrained building: first attempt, build task, no grammar support,
 *  a decisive outcome (success or established error). */
export function isBuildOpportunity(a: AttemptRecord): boolean {
  return (
    a.kind === 'main' &&
    !a.excluded &&
    BUILD_TYPES.has(a.type) &&
    !usedGrammarSupport(a.supportBeforeSubmit) &&
    (isSuccess(a.outcome) || isFailure(a.outcome))
  );
}

export interface Tally {
  total: number;
  ok: number;
}

export interface UnitEvidence {
  unit: UnitId;
  status: UnitStatus;
  mainAttempts: number;
  build: Tally;
  supported: Tally;
  meaning: Tally;
  byType: Partial<Record<TaskType, Tally>>;
  window: { size: number; ok: number; contexts: number; types: number; situation: number; met: boolean };
  delayed: { total: number; ok: number; last: RetentionEvent | null };
  hintsBeforeSubmit: number;
  translations: number;
  /** error types with their count and the learner's most recent sentence of that type */
  errors: { err: string; count: number; example: string }[];
  lastAt: number | null;
  independentSpeaking: 'not_assessed';
}

export function unitAttempts(attempts: readonly AttemptRecord[], unit: UnitId): AttemptRecord[] {
  return attempts.filter((a) => a.unit === unit && !a.excluded).sort((a, b) => a.submittedAt - b.submittedAt);
}

export function advancementWindow(opps: readonly AttemptRecord[]): UnitEvidence['window'] {
  const w = opps.slice(-CONFIG.advance.window);
  const ok = w.filter((a) => isSuccess(a.outcome));
  const contexts = new Set(ok.map((a) => a.ctx)).size;
  const types = new Set(ok.map((a) => a.type)).size;
  const situation = ok.filter((a) => !a.hebrewPrompt && !a.supportBeforeSubmit.includes('translation')).length;
  const met =
    ok.length >= CONFIG.advance.minSuccess &&
    contexts >= CONFIG.advance.minContexts &&
    types >= CONFIG.advance.minTaskTypes &&
    situation >= CONFIG.advance.minSituationNoHebrew;
  return { size: w.length, ok: ok.length, contexts, types, situation, met };
}

export function unitEvidence(unit: UnitId, attempts: readonly AttemptRecord[], state: UnitState | undefined): UnitEvidence {
  const all = unitAttempts(attempts, unit);
  const main = all.filter((a) => a.kind === 'main' && a.outcome !== 'skipped');
  const opps = main.filter(isBuildOpportunity);
  const tally = (list: readonly AttemptRecord[]): Tally => ({
    total: list.length,
    ok: list.filter((a) => isSuccess(a.outcome)).length,
  });
  const decisive = (a: AttemptRecord) => isSuccess(a.outcome) || isFailure(a.outcome);
  const supported = main.filter((a) => BUILD_TYPES.has(a.type) && usedGrammarSupport(a.supportBeforeSubmit) && decisive(a));
  const meaning = main.filter((a) => a.type === 'discriminate' && decisive(a));
  const byType: Partial<Record<TaskType, Tally>> = {};
  for (const a of main.filter(decisive)) {
    const t = byType[a.type] ?? { total: 0, ok: 0 };
    t.total += 1;
    if (isSuccess(a.outcome)) t.ok += 1;
    byType[a.type] = t;
  }
  const errCounts = new Map<string, number>();
  const errExample = new Map<string, string>();
  for (const a of main) {
    if (isFailure(a.outcome) && a.errorType) {
      errCounts.set(a.errorType, (errCounts.get(a.errorType) ?? 0) + 1);
      errExample.set(a.errorType, a.answerText);
    }
  }
  const retention = state?.retention ?? [];
  const last = retention.length ? (retention[retention.length - 1] as RetentionEvent) : null;
  const window = advancementWindow(opps);
  let status: UnitStatus = 'not_checked';
  if (last?.ok) status = 'checked_after_interval';
  else if (window.met) status = 'constrained_success';
  else if (main.length > 0) status = 'practicing';
  return {
    unit,
    status,
    mainAttempts: main.length,
    build: tally(opps),
    supported: tally(supported),
    meaning: tally(meaning),
    byType,
    window,
    delayed: { total: retention.length, ok: retention.filter((r) => r.ok).length, last },
    hintsBeforeSubmit: main.filter((a) => a.supportBeforeSubmit.includes('hint')).length,
    translations: main.filter((a) => a.supportBeforeSubmit.includes('translation')).length,
    errors: [...errCounts.entries()]
      .map(([err, count]) => ({ err, count, example: errExample.get(err) ?? '' }))
      .sort((a, b) => b.count - a.count),
    lastAt: all.length ? (all[all.length - 1] as AttemptRecord).submittedAt : null,
    independentSpeaking: 'not_assessed',
  };
}

export function isUnitDone(ev: UnitEvidence): boolean {
  return ev.status === 'constrained_success' || ev.status === 'checked_after_interval';
}

/** failures among the last `n` decisive main attempts */
export function recentFailures(attempts: readonly AttemptRecord[], unit: UnitId, n: number): number {
  const main = unitAttempts(attempts, unit).filter(
    (a) => a.kind === 'main' && (isSuccess(a.outcome) || isFailure(a.outcome)),
  );
  return main.slice(-n).filter((a) => isFailure(a.outcome)).length;
}
