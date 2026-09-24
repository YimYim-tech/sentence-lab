import { describe, expect, it } from 'vitest';
import { ITEM_BY_ID } from '../../src/content';
import { CONFIG } from '../../src/engine/config';
import { intervalMs, isDue, retentionEligibility, scheduleAfterAttempt } from '../../src/engine/schedule';
import { defaultUnitState } from '../../src/engine/snapshot';
import { localDay } from '../../src/engine/time';
import type { UnitState } from '../../src/engine/types';

const HOUR = 3_600_000;
const item = ITEM_BY_ID.get('S03-C1')!;

/** a local Asia/Jerusalem wall-clock time → UTC ms (IDT = UTC+3 in September) */
const il = (y: number, m: number, d: number, h: number, min = 0, offset = 3) => Date.UTC(y, m - 1, d, h - offset, min);

function scheduled(lastTeachAt: number, step = 0): UnitState {
  return { ...defaultUnitState('S03'), step, dueAt: lastTeachAt + intervalMs(step), lastTeachAt };
}

const base = {
  item,
  firstEver: true,
  famSeenBefore: false,
  lastSessionContexts: new Set<string>(['work.report']),
  taughtThisSegment: false,
  support: [] as const,
};

describe('local days in Asia/Jerusalem', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:30 local on 24.9 is 20:30 UTC the same day; 00:30 local on 25.9 is 21:30 UTC on 24.9
    expect(localDay(il(2026, 9, 24, 23, 30))).toBe('2026-09-24');
    expect(localDay(il(2026, 9, 25, 0, 30))).toBe('2026-09-25');
  });

  it('handles the end of daylight saving time (25.10.2026)', () => {
    // 25.10.2026 02:00 IDT → 01:00 IST. 23:30 on 25.10 is UTC+2.
    expect(localDay(Date.UTC(2026, 9, 25, 21, 30))).toBe('2026-10-25');
    expect(localDay(Date.UTC(2026, 9, 25, 22, 30))).toBe('2026-10-26');
  });

  it('handles the start of daylight saving time (27.3.2026)', () => {
    expect(localDay(Date.UTC(2026, 2, 26, 21, 59))).toBe('2026-03-26');
    expect(localDay(Date.UTC(2026, 2, 26, 22, 1))).toBe('2026-03-27');
  });
});

describe('eligible delayed checks', () => {
  const taught = il(2026, 9, 24, 9, 0);

  it('23:55 and 00:10 are different days but not a delayed check (20-hour rule)', () => {
    const last = il(2026, 9, 24, 23, 55);
    const r = retentionEligibility({ ...base, unitState: scheduled(last), now: il(2026, 9, 25, 0, 10) });
    expect(r.eligible).toBe(false);
    expect(r.why).toBe('too_soon');
  });

  it('20 hours on the same local day is not enough either', () => {
    const last = il(2026, 9, 24, 1, 0);
    const r = retentionEligibility({ ...base, unitState: scheduled(last), now: il(2026, 9, 24, 21, 30) });
    expect(r.why).toBe('same_day');
  });

  it('next day, ≥20 hours, new item, new context, no help: eligible', () => {
    const r = retentionEligibility({ ...base, unitState: scheduled(taught), now: taught + 26 * HOUR });
    expect(r.eligible).toBe(true);
    expect(r.hoursSinceTeach).toBe(26);
  });

  it('requires a new item, a new context, no help and no teaching earlier in the segment', () => {
    const us = scheduled(taught);
    const now = taught + 26 * HOUR;
    expect(retentionEligibility({ ...base, unitState: us, now, firstEver: false }).why).toBe('not_new_item');
    expect(retentionEligibility({ ...base, unitState: us, now, famSeenBefore: true }).why).toBe('family_seen');
    expect(
      retentionEligibility({ ...base, unitState: us, now, lastSessionContexts: new Set(['daily.home']) }).why,
    ).toBe('same_context');
    expect(retentionEligibility({ ...base, unitState: us, now, taughtThisSegment: true }).why).toBe('taught_this_segment');
    expect(retentionEligibility({ ...base, unitState: us, now, support: ['hint'] }).why).toBe('support_before_submit');
  });

  it('translation alone does not disqualify a delayed check', () => {
    const r = retentionEligibility({ ...base, unitState: scheduled(taught), now: taught + 30 * HOUR, support: ['translation'] });
    expect(r.eligible).toBe(true);
  });

  it('allows familiar items to count as eligible when cooled down (≥14 days)', () => {
    const us = scheduled(taught, 2);
    const now = taught + 15 * 24 * HOUR;
    const r = retentionEligibility({
      ...base,
      unitState: us,
      now,
      firstEver: false,
      lastItemAt: taught,
    });
    expect(r.eligible).toBe(true);
    expect(r.why).toBe('ok');

    const rRecent = retentionEligibility({
      ...base,
      unitState: us,
      now: taught + 3 * 24 * HOUR,
      firstEver: false,
      lastItemAt: taught + 1 * 24 * HOUR,
    });
    expect(rRecent.eligible).toBe(false);
    expect(rRecent.why).toBe('not_new_item');
  });
});

describe('spacing steps', () => {
  const taught = il(2026, 9, 24, 9, 0);

  it('the first decisive result enters the schedule (due tomorrow)', () => {
    const us = defaultUnitState('S03');
    const info = { eligible: false, why: 'not_scheduled', hoursSinceTeach: null, stepBefore: -1, stepAfter: -1 };
    const r = scheduleAfterAttempt(us, info, 'correct_target', 'x', taught);
    expect(r.state.step).toBe(0);
    expect(r.state.dueAt).toBe(taught + intervalMs(0));
  });

  it('an eligible success when due advances one step; a second one the same day does not', () => {
    const us = scheduled(taught, 0);
    const now = taught + 26 * HOUR;
    const info = retentionEligibility({ ...base, unitState: us, now });
    const r1 = scheduleAfterAttempt(us, info, 'correct_target', 'a', now);
    expect(r1.state.step).toBe(1);
    expect(r1.state.dueAt).toBe(now + CONFIG.intervalsDays[1] * 24 * HOUR);
    expect(r1.state.retention).toHaveLength(1);
    // pretend it is due again the same day: no second step
    const again = { ...r1.state, dueAt: now };
    const r2 = scheduleAfterAttempt(again, { ...info, eligible: true }, 'correct_target', 'b', now + HOUR);
    expect(r2.state.step).toBe(1);
  });

  it('an eligible failure steps back without deleting history', () => {
    const us: UnitState = {
      ...scheduled(taught, 3),
      retention: [{ at: 1, hours: 30, ok: true, stepBefore: 2, stepAfter: 3, itemId: 'z' }],
    };
    const now = taught + 15 * 24 * HOUR;
    const info = retentionEligibility({ ...base, unitState: us, now });
    const r = scheduleAfterAttempt(us, info, 'form_error', 'c', now);
    expect(r.state.step).toBe(1);
    expect(r.state.retention).toHaveLength(2);
    expect(r.state.retention[1]?.ok).toBe(false);
  });

  it('a practice error pulls the next review closer; repair attempts never touch the schedule', () => {
    const us = scheduled(taught, 3);
    const info = { eligible: false, why: 'same_day', hoursSinceTeach: 1, stepBefore: 3, stepAfter: 3 };
    const r = scheduleAfterAttempt(us, info, 'form_error', 'd', taught + HOUR);
    expect(r.state.step).toBe(3);
    expect(r.state.dueAt).toBe(taught + HOUR + intervalMs(0));
  });

  it('isDue honours the tolerance window', () => {
    const us = scheduled(taught, 0);
    expect(isDue(us, taught + 20 * HOUR)).toBe(true);
    expect(isDue(us, taught + 10 * HOUR)).toBe(false);
  });
});
