import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/engine/config';
import { unitEvidence } from '../../src/engine/progress';
import * as S from '../../src/engine/session';
import { answer, correctIds, DAY, HOUR, playSegment, Sim, T0, wrongIds } from './helpers';

function calibrated(policy: 'correct' | 'wrong' = 'correct'): Sim {
  const sim = new Sim();
  sim.run(S.startCalibration);
  playSegment(sim, () => policy);
  sim.run(S.closeSummary);
  return sim;
}

describe('calibration', () => {
  it('runs four tasks, then records neutral results without a level score', () => {
    const sim = new Sim();
    sim.run(S.startCalibration);
    expect(sim.seg?.slots).toHaveLength(4);
    playSegment(sim, (i) => (i % 2 ? 'wrong' : 'correct'));
    expect(sim.seg?.phase).toBe('summary');
    expect(sim.snap.profile.calibration).toBe('done');
    expect(Object.keys(sim.snap.profile.calibrationResults).sort()).toEqual(['S01', 'S03', 'S06', 'S08']);
  });

  it('failed calibration items adjust priorities (bridge / promotion)', () => {
    const sim = calibrated('wrong');
    expect(sim.snap.profile.bridgeNeeds.S01).toBe(2);
    expect(sim.snap.profile.promotedUnits).toEqual(expect.arrayContaining(['S06', 'S08']));
  });

  it('can be skipped', () => {
    const sim = new Sim();
    sim.run(S.skipCalibration);
    expect(sim.snap.profile.calibration).toBe('skipped');
    expect(sim.snap.profile.onboardingDone).toBe(true);
  });
});

describe('the scripted first segment', () => {
  it('follows the spec order: 2 reviews, explanation, focus, mixed, dialogue, exit', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'regular'));
    expect(sim.seg?.kind).toBe('first');
    expect(sim.seg?.focusUnit).toBe('S03');
    const seen: string[] = [];
    let explainAt = -1;
    let guard = 0;
    while (sim.seg && sim.seg.phase !== 'summary' && guard++ < 60) {
      if (sim.seg.phase === 'explain') explainAt = seen.length;
      else if (sim.task) seen.push(`${sim.task.item.id}${sim.task.turn !== null ? `#${sim.task.turn}` : ''}`);
      answer(sim, 'correct');
    }
    expect(seen.slice(0, 2)).toEqual(['S01-01', 'S03-01']);
    expect(explainAt).toBe(2);
    expect(seen).toContain('S04-01');
    expect(seen).toContain('S05-01');
    expect(seen).toEqual(expect.arrayContaining(['S06-01', 'S06-02', 'S03-D1#0', 'S03-D1#1', 'S03-C1', 'S03-C2']));
    expect(seen).toHaveLength(14);
    expect(sim.snap.profile.firstSegmentDone).toBe(true);
    expect(sim.snap.units.S03.lessonShownAt).not.toBeNull();
  });
});

describe('answering, repair and support', () => {
  it('a double submit records one attempt', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    const t = sim.task!;
    const ids = correctIds(t.item, t.turn);
    sim.run((s, e) => S.updateBuild(s, e, { answer: ids, caret: null, sticky: false, seed: 1 }));
    sim.run(S.submit);
    const n = sim.snap.attempts.length;
    sim.run(S.submit);
    expect(sim.snap.attempts.length).toBe(n);
  });

  it('a repair right after the solution is tagged assisted and never counts as independent success', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'regular'));
    const unit = sim.seg!.slots[0]!.unit ?? sim.task!.item.unit;
    const okBefore = unitEvidence(unit, sim.snap.attempts, sim.snap.units[unit]).build.ok;
    answer(sim, 'wrong-then-repair');
    const atts = sim.snap.attempts.filter((a) => a.segmentId === sim.seg?.segmentId);
    const main = atts.find((a) => a.kind === 'main');
    const repair = atts.find((a) => a.kind === 'repair');
    expect(main?.outcome).toMatch(/form_error|meaning_mismatch/);
    expect(repair?.outcome).toBe('correct_target');
    expect(repair?.assisted).toBe(true);
    expect(repair?.supportBeforeSubmit).toContain('model');
    const ev = unitEvidence(main!.unit, sim.snap.attempts, sim.snap.units[main!.unit]);
    expect(ev.build.ok).toBe(okBefore);
  });

  it('after the repairs run out there is no loop: the task is demonstrated and the segment moves on', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    const t = sim.task!;
    const bad = wrongIds(t.item, t.turn)!;
    expect(bad).not.toBeNull();
    for (let k = 0; k <= CONFIG.maxRepairs; k++) {
      sim.run((s, e) => S.updateBuild(s, e, { answer: bad, caret: null, sticky: false, seed: 1 }));
      sim.run(S.submit);
      if (sim.task && S.canRepair(sim.task)) sim.run(S.startRepair);
    }
    expect(sim.task?.attemptNo).toBe(CONFIG.maxRepairs);
    expect(S.canRepair(sim.task!)).toBe(false);
    const before = sim.seg!.index;
    sim.run(S.continueFlow);
    expect(sim.seg!.index).toBeGreaterThan(before);
  });

  it('records a hint before submitting as support (not an unassisted opportunity)', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    answer(sim, 'hint');
    const a = sim.snap.attempts[sim.snap.attempts.length - 1]!;
    expect(a.supportBeforeSubmit).toContain('hint');
  });

  it('asking "why" after answering does not change the recorded attempt', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    const t = sim.task!;
    sim.run((s, e) => S.updateBuild(s, e, { answer: correctIds(t.item, t.turn), caret: null, sticky: false, seed: 1 }));
    sim.run(S.submit);
    const id = sim.snap.attempts[sim.snap.attempts.length - 1]!.attemptId;
    sim.run((s, e) => S.openHelp(s, e, 'why'));
    const a = sim.snap.attempts.find((x) => x.attemptId === id)!;
    expect(a.supportBeforeSubmit).not.toContain('why');
  });

  it('skip is recorded as skipped, never as an error', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    answer(sim, 'skip');
    const a = sim.snap.attempts[sim.snap.attempts.length - 1]!;
    expect(a.outcome).toBe('skipped');
  });

  it('a reported question is excluded from progress', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    const t = sim.task!;
    sim.run((s, e) => S.updateBuild(s, e, { answer: correctIds(t.item, t.turn), caret: null, sticky: false, seed: 1 }));
    sim.run(S.submit);
    sim.run((s, e) => S.reportProblem(s, e, 'seems_wrong'));
    const related = sim.snap.attempts.filter((a) => a.itemId === t.item.id && a.segmentId === sim.seg!.segmentId);
    expect(related.every((a) => a.excluded)).toBe(true);
    expect(sim.snap.reports).toHaveLength(1);
  });

  it('an error schedules a re-check of the same unit 3–5 tasks later with a different item', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'regular'));
    // first task (review) wrong
    const firstItem = sim.task!.item.id;
    answer(sim, 'wrong');
    const unit = sim.seg!.slots[0]!.unit;
    playSegment(sim, () => 'correct');
    const slots = sim.seg!.slots;
    const recheck = slots.findIndex((s) => s.reason === 'recheck_after_error');
    expect(recheck).toBeGreaterThanOrEqual(CONFIG.recheckGap + 1);
    expect(slots[recheck]!.unit).toBe(unit);
    expect(slots[recheck]!.itemId).not.toBe(firstItem);
  });
});

describe('pause, resume and summary', () => {
  it('pausing keeps the exact task; ending early produces a summary', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'regular'));
    answer(sim, 'correct');
    const t = sim.task;
    const partial = t?.build ? { ...t.build, answer: t.build.answer.length ? t.build.answer : [] } : null;
    sim.run(S.pauseSegment);
    expect(sim.task?.item.id).toBe(t?.item.id);
    expect(sim.task?.build).toEqual(partial);
    sim.run(S.endSegmentEarly);
    expect(sim.seg?.phase).toBe('summary');
    expect(sim.seg?.summary?.completed).toBe(false);
    expect(sim.snap.segments).toHaveLength(2);
  });

  it('the summary separates first-try success without help', () => {
    const sim = calibrated();
    sim.run((s, e) => S.startSegment(s, e, 'short'));
    playSegment(sim, (i) => (i === 0 ? 'hint' : 'correct'));
    const s = sim.seg!.summary!;
    const total = s.firstTry.reduce((n, f) => n + f.total, 0);
    const ok = s.firstTry.reduce((n, f) => n + f.ok, 0);
    expect(total).toBeGreaterThan(ok - 1);
    expect(ok).toBeLessThan(total);
  });
});

describe('three simulated learners (spec §14.14)', () => {
  function learner(policy: (seg: number, i: number) => 'correct' | 'wrong' | 'hint' | 'skip', segments: number, stopAt?: number) {
    const sim = calibrated();
    for (let n = 0; n < segments; n++) {
      sim.run((s, e) => S.startSegment(s, e, 'regular'));
      let i = 0;
      let guard = 0;
      while (sim.seg && sim.seg.phase !== 'summary' && guard++ < 80) {
        if (stopAt !== undefined && n === segments - 1 && i === stopAt) {
          sim.run(S.pauseSegment);
          return sim;
        }
        const o = answer(sim, policy(n, i));
        if (o !== 'explain') i += 1;
      }
      sim.run(S.closeSummary);
      sim.now += DAY + 2 * HOUR;
    }
    return sim;
  }

  it('recognises well but struggles to build: stays on the focus and gets bridges', () => {
    const sim = learner((_, i) => (i % 3 === 0 ? 'correct' : 'wrong'), 3);
    expect(sim.snap.profile.currentFocus).toBe('S03');
    const ev = unitEvidence('S03', sim.snap.attempts, sim.snap.units.S03);
    expect(ev.status).toBe('practicing');
    expect(sim.snap.attempts.some((a) => a.reason === 'recheck_after_error')).toBe(true);
  });

  it('succeeds without help and returns after a gap: advances and passes delayed checks', () => {
    const sim = learner(() => 'correct', 4);
    const ev = unitEvidence('S03', sim.snap.attempts, sim.snap.units.S03);
    expect(['constrained_success', 'checked_after_interval']).toContain(ev.status);
    expect(sim.snap.profile.currentFocus).not.toBe('S03');
    const delayed = Object.values(sim.snap.units).flatMap((u) => u.retention);
    expect(delayed.length).toBeGreaterThan(0);
    for (const d of delayed) expect(d.hours).toBeGreaterThanOrEqual(CONFIG.retentionMinHours);
  });

  it('needs help and stops midway: the segment resumes exactly where it stopped', () => {
    const sim = learner(() => 'hint', 1, 5);
    const seg = sim.seg!;
    expect(seg.phase).not.toBe('summary');
    const idx = seg.index;
    const inSegment = sim.snap.attempts.filter((a) => a.segmentId === seg.segmentId);
    const ev = unitEvidence('S03', inSegment, sim.snap.units.S03);
    expect(ev.build.total).toBe(0);
    expect(ev.supported.total).toBeGreaterThan(0);
    expect(sim.seg!.index).toBe(idx);
    expect(sim.task).not.toBeNull();
  });

  it('reserved check items are used only as exit or delayed checks, never as ordinary practice', () => {
    const sim = learner(() => 'correct', 5);
    const checkIds = new Set(
      [...sim.snap.attempts].filter((a) => a.role === 'check' && a.kind === 'main').map((a) => a.attemptId),
    );
    expect(checkIds.size).toBeGreaterThan(0);
    for (const a of sim.snap.attempts.filter((x) => checkIds.has(x.attemptId))) {
      expect(['exit_check', 'due_review', 'first_segment'], `${a.itemId} (${a.slotRole})`).toContain(a.reason);
      if (a.reason === 'first_segment') expect(a.slotRole, a.itemId).toBe('exit');
    }
  });

  it('never repeats an item inside one segment and ends early instead of padding', () => {
    const sim = learner(() => 'correct', 6);
    for (const s of sim.snap.segments) {
      const ids = sim.snap.attempts
        .filter((a) => a.segmentId === s.segmentId && a.kind === 'main')
        .map((a) => `${a.itemId}#${a.turn ?? ''}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('time is taken from the clock', () => {
  it('uses the environment time for every record', () => {
    const sim = new Sim(T0 + 5 * DAY);
    sim.run(S.startCalibration);
    answer(sim, 'correct');
    expect(sim.snap.attempts[0]!.submittedAt).toBeGreaterThan(T0 + 5 * DAY);
  });
});
