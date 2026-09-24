import type { Item, Outcome } from '../content/schema';
import { CONFIG } from './config';
import { isFailure, isSuccess } from './evaluate';
import { usedGrammarSupport } from './progress';
import { DAY, HOUR, hoursBetween, localDay } from './time';
import type { RetentionInfo, SupportKind, UnitState } from './types';

export interface RetentionContext {
  unitState: UnitState;
  item: Item;
  /** the item (and turn) had never been shown before this attempt */
  firstEver: boolean;
  /** another item of the same variant family was shown before */
  famSeenBefore: boolean;
  /** timestamp when this item was last shown (null if never) */
  lastItemAt?: number | null;
  /** timestamp when an item of this family was last shown (null if never) */
  lastFamAt?: number | null;
  /** contexts of this unit's items in the most recent earlier segment that practised it */
  lastSessionContexts: ReadonlySet<string>;
  /** the unit's solution / hint / lesson was shown earlier in this segment */
  taughtThisSegment: boolean;
  support: readonly SupportKind[];
  now: number;
}

/** Decide whether an attempt counts as an eligible delayed (retention) check (spec §9). */
export function retentionEligibility(c: RetentionContext): RetentionInfo {
  const base = { hoursSinceTeach: null as number | null, stepBefore: c.unitState.step, stepAfter: c.unitState.step };
  const last = c.unitState.lastTeachAt;
  if (last !== null) base.hoursSinceTeach = Math.round(hoursBetween(last, c.now) * 10) / 10;
  const no = (why: string): RetentionInfo => ({ eligible: false, why, ...base });
  if (c.unitState.step < 0 || last === null) return no('not_scheduled');

  const cooldownMs = CONFIG.itemCooldownDays * DAY;
  const itemCooled = c.lastItemAt !== undefined && c.lastItemAt !== null && c.now - c.lastItemAt >= cooldownMs;
  const famCooled = c.lastFamAt !== undefined && c.lastFamAt !== null && c.now - c.lastFamAt >= cooldownMs;

  if (!c.firstEver && !itemCooled) return no('not_new_item');
  if (c.famSeenBefore && !famCooled && !itemCooled) return no('family_seen');
  if (c.lastSessionContexts.has(c.item.ctx)) return no('same_context');
  if (c.taughtThisSegment) return no('taught_this_segment');
  if (usedGrammarSupport(c.support)) return no('support_before_submit');
  if (localDay(last) === localDay(c.now)) return no('same_day');
  if (c.now - last < CONFIG.retentionMinHours * HOUR) return no('too_soon');
  return { eligible: true, why: 'ok', ...base };
}

export function intervalMs(step: number): number {
  const days = CONFIG.intervalsDays[Math.max(0, Math.min(step, CONFIG.intervalsDays.length - 1))] ?? 1;
  return days * DAY;
}

export function isDue(us: UnitState, now: number): boolean {
  return us.step >= 0 && us.dueAt !== null && now >= us.dueAt - CONFIG.dueToleranceHours * HOUR;
}

/**
 * Update a unit's spacing state after a MAIN attempt.
 * Returns the new state and the retention info with stepAfter filled in.
 */
export function scheduleAfterAttempt(
  us: UnitState,
  info: RetentionInfo,
  outcome: Outcome,
  itemId: string,
  now: number,
): { state: UnitState; info: RetentionInfo } {
  const ok = isSuccess(outcome);
  const bad = isFailure(outcome);
  const today = localDay(now);
  let next: UnitState = { ...us };
  if (info.eligible && (ok || bad)) {
    const hours = info.hoursSinceTeach ?? 0;
    if (ok) {
      const canAdvance = isDue(us, now) && us.lastAdvanceDay !== today;
      if (canAdvance) {
        const step = Math.min(us.step + 1, CONFIG.intervalsDays.length - 1);
        next = { ...next, step, dueAt: now + intervalMs(step), lastAdvanceDay: today };
      }
    } else {
      const step = Math.max(0, us.step - CONFIG.lapseStepBack);
      next = { ...next, step, dueAt: now + intervalMs(step) };
    }
    next.retention = [
      ...us.retention,
      { at: now, hours, ok, stepBefore: us.step, stepAfter: next.step, itemId },
    ];
  } else if (us.step < 0) {
    // first decisive result enters the schedule: the unit comes back tomorrow either way
    if (ok || bad) next = { ...next, step: 0, dueAt: now + intervalMs(0) };
  } else if (bad) {
    const soon = now + intervalMs(0);
    next = { ...next, dueAt: Math.min(us.dueAt ?? soon, soon) };
  } else if (ok && isDue(us, now)) {
    // a familiar review (not an eligible check) succeeded while due: postpone at the same step
    next = { ...next, dueAt: now + intervalMs(us.step) };
  }
  return { state: next, info: { ...info, stepAfter: next.step } };
}

export function markTaught(us: UnitState, now: number): UnitState {
  return { ...us, lastTeachAt: now };
}
