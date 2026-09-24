/**
 * The practice session as an explicit state machine.
 *
 * Every function is pure: it takes the current snapshot and returns a `Change` — the exact set of
 * records to write. The storage layer commits a change atomically; the UI applies the same change
 * to its in-memory snapshot. Nothing here knows about React, IndexedDB or the screen, so another
 * front end (for example a spoken one) can drive the same lessons.
 */
import type { Item, Outcome, UnitId } from '../content/schema';
import { CALIBRATION } from '../content/calibration';
import { answerTokens, buildView, initialBuild } from './builder';
import { BRIDGE_BY_ERROR, BRIDGE_UNITS, CONFIG, type SegmentSize } from './config';
import { evaluateBuild, evaluateChoice, isFailure, isSuccess, type Evaluation } from './evaluate';
import { recentFailures, unitEvidence, usedGrammarSupport } from './progress';
import { hashString, randomId } from './rng';
import { intervalMs, markTaught, retentionEligibility, scheduleAfterAttempt } from './schedule';
import {
  chooseFocus,
  fillSlot,
  lastSessionContexts,
  needsExplanation,
  planSlots,
  turnUnit,
  unitDone,
  type ContentIndex,
} from './select';
import { applyChange, defaultUnitState } from './snapshot';
import { HOUR } from './time';
import type {
  ActiveSegment,
  AttemptRecord,
  BuildState,
  Change,
  CurrentTask,
  EventRecord,
  HelpKind,
  Profile,
  ReportReason,
  SegmentSummary,
  Slot,
  Snapshot,
  SupportKind,
  UnitState,
} from './types';

export interface Env {
  idx: ContentIndex;
  now: number;
  appSession: string;
  contentVersion: string;
}

/* ---------------------------------------------------------------- helpers */

function unit(snap: Snapshot, id: UnitId): UnitState {
  return snap.units[id] ?? defaultUnitState(id);
}

function bump(seg: ActiveSegment, now: number): ActiveSegment {
  return { ...seg, rev: seg.rev + 1, updatedAt: now };
}

function event(type: EventRecord['type'], now: number, data: EventRecord['data'] = {}): EventRecord {
  return { id: randomId('ev'), at: now, type, data };
}

function merge(a: Change, b: Change): Change {
  const byKey = <T>(x: T[] | undefined, y: T[] | undefined, key: (t: T) => string): T[] | undefined => {
    if (!x) return y;
    if (!y) return x;
    const m = new Map<string, T>();
    for (const t of x) m.set(key(t), t);
    for (const t of y) m.set(key(t), t);
    return [...m.values()];
  };
  const out: Change = {};
  const profile = b.profile ?? a.profile;
  if (profile) out.profile = profile;
  const settings = b.settings ?? a.settings;
  if (settings) out.settings = settings;
  const units = byKey(a.units, b.units, (u) => u.unit);
  if (units) out.units = units;
  const attempts = byKey(a.attempts, b.attempts, (x) => x.attemptId);
  if (attempts) out.attempts = attempts;
  const exposures = byKey(a.exposures, b.exposures, (e) => e.itemId);
  if (exposures) out.exposures = exposures;
  if (b.active !== undefined) out.active = b.active;
  else if (a.active !== undefined) out.active = a.active;
  const segments = byKey(a.segments, b.segments, (s) => s.segmentId);
  if (segments) out.segments = segments;
  const reports = byKey(a.reports, b.reports, (r) => r.reportId);
  if (reports) out.reports = reports;
  const events = byKey(a.events, b.events, (e) => e.id);
  if (events) out.events = events;
  return out;
}

export function currentView(task: CurrentTask) {
  return buildView(task.item, task.turn);
}

/** The build spec / partner line for the current task. */
export function currentUnit(task: CurrentTask): UnitId {
  return turnUnit(task.item, task.turn);
}

/* ------------------------------------------------------------ calibration */

export function startCalibration(snap: Snapshot, env: Env): Change {
  const segmentId = randomId('cal');
  const slots: Slot[] = CALIBRATION.map((it) => ({
    role: 'calibration',
    itemId: it.id,
    turn: null,
    unit: it.unit,
    reason: 'calibration',
    status: 'pending',
    outcome: null,
    familiar: false,
  }));
  const seg: ActiveSegment = {
    segmentId,
    rev: 0,
    kind: 'calibration',
    size: 'short',
    focusUnit: null,
    reason: 'calibration',
    createdAt: env.now,
    updatedAt: env.now,
    slots,
    index: 0,
    phase: 'task',
    explainUnit: null,
    explainBefore: -1,
    explainDone: true,
    current: null,
    pendingRechecks: [],
    taughtUnits: [],
    dialogue: null,
    summary: null,
  };
  const profile: Profile = { ...snap.profile, onboardingDone: true };
  const start: Change = { profile, events: [event('segment_started', env.now, { kind: 'calibration' })] };
  return merge(start, enterSlot(applyChange(snap, start), env, seg, 0));
}

export function skipCalibration(snap: Snapshot, env: Env): Change {
  return {
    profile: { ...snap.profile, onboardingDone: true, calibration: 'skipped' },
    events: [event('segment_ended_early', env.now, { kind: 'calibration', skipped: true })],
  };
}

/* -------------------------------------------------------------- segments */

export function startSegment(snap: Snapshot, env: Env, size: SegmentSize): Change {
  if (snap.active && snap.active.phase !== 'summary') return {};
  const first = !snap.profile.firstSegmentDone;
  const focus = first ? { unit: 'S03' as UnitId, reason: 'first_segment' as const } : chooseFocus(snap);
  const slots = planSlots(size);
  const firstFocusSlot = slots.findIndex((s) => s.role === 'focus');
  const seg: ActiveSegment = {
    segmentId: randomId('seg'),
    rev: 0,
    kind: first ? 'first' : 'regular',
    size,
    focusUnit: focus.unit,
    reason: focus.reason,
    createdAt: env.now,
    updatedAt: env.now,
    slots,
    index: 0,
    phase: 'task',
    explainUnit: focus.unit,
    explainBefore: firstFocusSlot,
    explainDone: !needsExplanation(snap, focus.unit),
    current: null,
    pendingRechecks: [],
    taughtUnits: [],
    dialogue: null,
    summary: null,
  };
  const us = unit(snap, focus.unit);
  const profile: Profile = { ...snap.profile, currentFocus: focus.unit };
  const start: Change = {
    profile,
    units: [{ ...us, focusSegments: us.focusSegments + 1, lastFocusAt: env.now }],
    events: [event('segment_started', env.now, { kind: seg.kind, size, focus: focus.unit, reason: focus.reason })],
  };
  return merge(start, enterSlot(applyChange(snap, start), env, seg, 0));
}

/** Move to the first fillable slot at or after `index` (or show the explanation, or finish). */
function enterSlot(snap: Snapshot, env: Env, segIn: ActiveSegment, index: number): Change {
  let seg: ActiveSegment = { ...segIn, slots: [...segIn.slots] };
  for (let i = index; i < seg.slots.length; i++) {
    const slot = seg.slots[i] as Slot;
    if (slot.status === 'done' || slot.status === 'skipped') continue;
    if (i === seg.explainBefore && !seg.explainDone && seg.explainUnit) {
      return { active: bump({ ...seg, index: i, phase: 'explain', current: null }, env.now) };
    }
    let pick =
      slot.role === 'calibration' && slot.itemId
        ? { itemId: slot.itemId, turn: null, unit: slot.unit as UnitId, reason: 'calibration' as const, familiar: false }
        : fillSlot(snap, env.idx, seg, i, env.now);
    const item = pick ? env.idx.byId.get(pick.itemId) : undefined;
    if (!pick || !item) {
      seg.slots[i] = { ...slot, status: 'skipped', reason: 'content_exhausted' };
      continue;
    }
    const prevExposure = snap.exposures[item.id];
    const continuingDialogue = item.type === 'dialogue' && (pick.turn ?? 0) > 0;
    const firstEver = continuingDialogue
      ? Boolean(prevExposure && prevExposure.segments.length === 1 && prevExposure.segments[0] === seg.segmentId)
      : !prevExposure;
    const exposure = continuingDialogue && prevExposure
      ? prevExposure
      : {
          itemId: item.id,
          firstAt: prevExposure?.firstAt ?? env.now,
          lastAt: env.now,
          count: (prevExposure?.count ?? 0) + 1,
          segments: [...new Set([...(prevExposure?.segments ?? []), seg.segmentId])],
        };
    const view = buildView(item, pick.turn);
    const support: SupportKind[] = item.stage === 1 && item.scaffold && item.role !== 'check' ? ['scaffold'] : [];
    const current: CurrentTask = {
      slotIndex: i,
      item,
      turn: pick.turn,
      shownAt: env.now,
      attemptNo: 0,
      build: view ? initialBuild(view, hashString(`${seg.segmentId}:${i}:${item.id}`)) : null,
      choice: item.type === 'discriminate' ? [] : null,
      support,
      help: null,
      deepOpen: false,
      lastEval: null,
      lastAnswer: null,
      mainOutcome: null,
      modelVisible: false,
      demonstrated: false,
      familiar: pick.familiar,
      firstEver,
    };
    seg.slots[i] = {
      ...slot,
      itemId: item.id,
      turn: pick.turn,
      unit: pick.unit,
      reason: pick.reason,
      status: 'active',
      familiar: pick.familiar,
    };
    let pendingRechecks = seg.pendingRechecks;
    let profile: Profile | undefined;
    if (pick.reason === 'recheck_after_error') {
      const at = pendingRechecks.findIndex((r) => r.unit === pick.unit);
      if (at !== -1) pendingRechecks = pendingRechecks.filter((_, k) => k !== at);
      if (snap.profile.recheckNext.includes(pick.unit)) {
        profile = { ...snap.profile, recheckNext: snap.profile.recheckNext.filter((u) => u !== pick.unit) };
      }
    }
    const dialogue =
      item.type === 'dialogue'
        ? {
            itemId: item.id,
            turn: pick.turn ?? 0,
            prevAcceptIndex: continuingDialogue ? (seg.dialogue?.prevAcceptIndex ?? null) : null,
          }
        : null;
    seg = { ...seg, index: i, phase: 'task', current, pendingRechecks, dialogue };
    const change: Change = { active: bump(seg, env.now), exposures: [exposure] };
    if (profile) change.profile = profile;
    return change;
  }
  return finishSegment(snap, env, seg, seg.slots.some((s) => s.reason === 'content_exhausted') ? 'content_exhausted' : null);
}

/* ------------------------------------------------------------ task input */

function withCurrent(snap: Snapshot, env: Env, patch: Partial<CurrentTask>): Change {
  const seg = snap.active;
  if (!seg || !seg.current) return {};
  return { active: bump({ ...seg, current: { ...seg.current, ...patch } }, env.now) };
}

export function updateBuild(snap: Snapshot, env: Env, build: BuildState): Change {
  const seg = snap.active;
  if (!seg?.current || (seg.phase !== 'task' && seg.phase !== 'repair')) return {};
  return withCurrent(snap, env, { build });
}

export function updateChoice(snap: Snapshot, env: Env, choice: string[]): Change {
  const seg = snap.active;
  if (!seg?.current || seg.phase !== 'task') return {};
  return withCurrent(snap, env, { choice });
}

export function openHelp(snap: Snapshot, env: Env, kind: HelpKind): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur) return {};
  const beforeSubmit = seg.phase === 'task' || seg.phase === 'repair';
  const support = beforeSubmit && !cur.support.includes(kind) ? [...cur.support, kind] : cur.support;
  const u = currentUnit(cur);
  const teaches = kind !== 'translation';
  const change: Change = {
    active: bump(
      {
        ...seg,
        current: { ...cur, help: kind, support },
        taughtUnits: teaches && !seg.taughtUnits.includes(u) ? [...seg.taughtUnits, u] : seg.taughtUnits,
      },
      env.now,
    ),
    events: [event('help_used', env.now, { kind, itemId: cur.item.id, beforeSubmit })],
  };
  if (teaches) change.units = [markTaught(unit(snap, u), env.now)];
  return change;
}

export function closeHelp(snap: Snapshot, env: Env): Change {
  return withCurrent(snap, env, { help: null });
}

export function toggleDeep(snap: Snapshot, env: Env): Change {
  const cur = snap.active?.current;
  if (!cur) return {};
  return withCurrent(snap, env, { deepOpen: !cur.deepOpen });
}

export function toggleModel(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur || seg.phase !== 'repair') return {};
  const support = cur.support.includes('model') ? cur.support : [...cur.support, 'model' as const];
  return withCurrent(snap, env, { modelVisible: !cur.modelVisible, support });
}

export function canSubmit(task: CurrentTask): boolean {
  if (task.item.type === 'discriminate') return (task.choice?.length ?? 0) > 0;
  return (task.build?.answer.length ?? 0) > 0;
}

/* ----------------------------------------------------------------- submit */

function answerOf(task: CurrentTask): { ids: string[]; texts: string[]; ev: Evaluation } {
  if (task.item.type === 'discriminate') {
    const ids = task.choice ?? [];
    return { ids, texts: ids, ev: evaluateChoice(task.item, ids) };
  }
  const view = buildView(task.item, task.turn);
  if (!view || !task.build) throw new Error('build task without build state');
  const tokens = answerTokens(view, task.build);
  return { ids: task.build.answer, texts: tokens.map((t) => t.t), ev: evaluateBuild(view.spec, tokens) };
}

function famSeenBefore(snap: Snapshot, env: Env, item: Item): boolean {
  return Object.keys(snap.exposures).some((id) => id !== item.id && env.idx.byId.get(id)?.fam === item.fam);
}

export function submit(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur || (seg.phase !== 'task' && seg.phase !== 'repair') || !canSubmit(cur)) return {};
  const isMain = seg.phase === 'task';
  const { ids, texts, ev } = answerOf(cur);
  const u = currentUnit(cur);
  const before = unit(snap, u);
  let retention = null as AttemptRecord['retention'];
  let us = before;
  if (isMain) {
    const lastItemExposure = snap.exposures[cur.item.id]?.lastAt ?? null;
    const famExposures = Object.values(snap.exposures).filter((e) => {
      const it = env.idx.byId.get(e.itemId);
      return it && it.fam === cur.item.fam;
    });
    const lastFamExposure = famExposures.length
      ? Math.max(...famExposures.map((e) => e.lastAt))
      : null;

    const info = retentionEligibility({
      unitState: before,
      item: cur.item,
      firstEver: cur.firstEver,
      famSeenBefore: famSeenBefore(snap, env, cur.item),
      lastItemAt: lastItemExposure,
      lastFamAt: lastFamExposure,
      lastSessionContexts: lastSessionContexts(snap, u, seg.segmentId),
      taughtThisSegment: seg.taughtUnits.includes(u),
      support: cur.support,
      now: env.now,
    });
    const r = scheduleAfterAttempt(before, info, ev.outcome, cur.item.id, env.now);
    us = r.state;
    retention = r.info;
  }
  us = markTaught(us, env.now);
  const item = cur.item;
  const attempt: AttemptRecord = {
    attemptId: `${seg.segmentId}:${cur.slotIndex}:${cur.attemptNo}`,
    segmentId: seg.segmentId,
    appSession: env.appSession,
    slotIndex: cur.slotIndex,
    slotRole: seg.slots[cur.slotIndex]?.role ?? 'focus',
    reason: seg.slots[cur.slotIndex]?.reason ?? 'focus_continue',
    itemId: item.id,
    itemVersion: item.v,
    contentVersion: env.contentVersion,
    turn: cur.turn,
    skill: item.skill,
    unit: u,
    sub: item.type === 'dialogue' && cur.turn !== null ? (item.turns[cur.turn]?.sub ?? item.sub) : item.sub,
    ctx: item.ctx,
    fam: item.fam,
    type: item.type,
    role: item.role,
    stage: item.stage,
    kind: isMain ? 'main' : 'repair',
    attemptNo: cur.attemptNo,
    firstAttempt: isMain,
    firstEver: isMain && cur.firstEver,
    familiar: cur.familiar,
    shownAt: cur.shownAt,
    submittedAt: env.now,
    answer: texts,
    answerText: texts.join(' '),
    supportBeforeSubmit: [...cur.support],
    feedbackShown: true,
    outcome: ev.outcome,
    errorType: ev.err ?? null,
    evalSource: ev.source,
    hebrewPrompt: Boolean(item.promptHe),
    assisted: !isMain,
    retention,
    excluded: false,
    reportReason: null,
  };

  const slots = [...seg.slots];
  const slot = slots[cur.slotIndex];
  if (slot && isMain) slots[cur.slotIndex] = { ...slot, outcome: ev.outcome };
  if (slot && !isMain && isSuccess(ev.outcome)) slots[cur.slotIndex] = { ...slot, outcome: slot.outcome };

  let pendingRechecks = seg.pendingRechecks;
  if (isMain && isFailure(ev.outcome) && seg.kind !== 'calibration') {
    pendingRechecks = [...pendingRechecks, { unit: u, notBefore: cur.slotIndex + CONFIG.recheckGap + 1 }];
  }

  let profile: Profile = snap.profile;
  const bridge = isFailure(ev.outcome) && ev.err ? BRIDGE_BY_ERROR[ev.err] : undefined;
  if (bridge && bridge !== u) profile = { ...profile, bridgeNeeds: { ...profile.bridgeNeeds, [bridge]: 2 } };
  if (seg.kind === 'calibration' && isMain) {
    profile = { ...profile, calibrationResults: { ...profile.calibrationResults, [u]: ev.outcome } };
  }
  const attemptsAfter = [...snap.attempts, attempt];
  if (
    isMain &&
    isFailure(ev.outcome) &&
    u !== seg.focusUnit &&
    !BRIDGE_UNITS.includes(u) &&
    !profile.promotedUnits.includes(u) &&
    recentFailures(attemptsAfter, u, 3) >= CONFIG.promoteAfterFailures &&
    !unitDone({ ...snap, attempts: attemptsAfter }, u)
  ) {
    profile = { ...profile, promotedUnits: [...profile.promotedUnits, u] };
  }

  const dialogue =
    seg.dialogue && item.type === 'dialogue' && (isSuccess(ev.outcome) || ev.outcome === 'target_not_used')
      ? { ...seg.dialogue, prevAcceptIndex: ev.acceptIndex ?? 0 }
      : seg.dialogue;

  const current: CurrentTask = {
    ...cur,
    lastEval: ev,
    lastAnswer: ids,
    mainOutcome: isMain ? ev.outcome : cur.mainOutcome,
    help: null,
    deepOpen: false,
    support: [],
    modelVisible: false,
    demonstrated: !isMain && isFailure(ev.outcome) && cur.attemptNo >= CONFIG.maxRepairs,
  };
  const change: Change = {
    active: bump(
      {
        ...seg,
        slots,
        phase: 'feedback',
        current,
        pendingRechecks,
        dialogue,
        taughtUnits: seg.taughtUnits.includes(u) ? seg.taughtUnits : [...seg.taughtUnits, u],
      },
      env.now,
    ),
    attempts: [attempt],
    units: [us],
  };
  if (profile !== snap.profile) change.profile = profile;
  return change;
}

/** A repair is offered after an established error (and optionally to try the target structure). */
export function canRepair(task: CurrentTask): boolean {
  const ev = task.lastEval;
  if (!ev || task.item.type === 'discriminate') return false;
  if (task.attemptNo >= CONFIG.maxRepairs) return false;
  return isFailure(ev.outcome) || ev.outcome === 'target_not_used';
}

export function startRepair(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur || seg.phase !== 'feedback' || !canRepair(cur)) return {};
  const view = buildView(cur.item, cur.turn);
  if (!view) return {};
  const answer = (cur.lastAnswer ?? []).filter((id) => view.all.some((t) => t.id === id));
  const build: BuildState = { answer, caret: null, sticky: false, seed: cur.build?.seed ?? 1 };
  return {
    active: bump(
      {
        ...seg,
        phase: 'repair',
        current: { ...cur, attemptNo: cur.attemptNo + 1, build, help: null, modelVisible: false, support: ['model'] },
      },
      env.now,
    ),
  };
}

/* --------------------------------------------------------------- continue */

export function continueFlow(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  if (!seg) return {};
  if (seg.phase === 'explain' && seg.explainUnit) {
    const u = seg.explainUnit;
    const us = markTaught({ ...unit(snap, u), lessonShownAt: env.now }, env.now);
    const next: ActiveSegment = {
      ...seg,
      explainDone: true,
      taughtUnits: seg.taughtUnits.includes(u) ? seg.taughtUnits : [...seg.taughtUnits, u],
    };
    const c1: Change = { units: [us] };
    return merge(c1, enterSlot(applyChange(snap, c1), env, next, seg.index));
  }
  if (seg.phase === 'feedback' && seg.current) {
    const cur = seg.current;
    const slots = [...seg.slots];
    const slot = slots[cur.slotIndex];
    if (slot) slots[cur.slotIndex] = { ...slot, status: 'done', outcome: cur.mainOutcome ?? slot.outcome };
    const next: ActiveSegment = { ...seg, slots, current: null };
    return enterSlot(snap, env, next, cur.slotIndex + 1);
  }
  return {};
}

/** Skip the current task: recorded as `skipped`, never as an error. */
export function skipTask(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur) return {};
  if (seg.phase !== 'task') return continueFlow(snap, env);
  const u = currentUnit(cur);
  const item = cur.item;
  const attempt: AttemptRecord = {
    attemptId: `${seg.segmentId}:${cur.slotIndex}:${cur.attemptNo}`,
    segmentId: seg.segmentId,
    appSession: env.appSession,
    slotIndex: cur.slotIndex,
    slotRole: seg.slots[cur.slotIndex]?.role ?? 'focus',
    reason: seg.slots[cur.slotIndex]?.reason ?? 'focus_continue',
    itemId: item.id,
    itemVersion: item.v,
    contentVersion: env.contentVersion,
    turn: cur.turn,
    skill: item.skill,
    unit: u,
    sub: item.sub,
    ctx: item.ctx,
    fam: item.fam,
    type: item.type,
    role: item.role,
    stage: item.stage,
    kind: 'main',
    attemptNo: cur.attemptNo,
    firstAttempt: true,
    firstEver: cur.firstEver,
    familiar: cur.familiar,
    shownAt: cur.shownAt,
    submittedAt: env.now,
    answer: [],
    answerText: '',
    supportBeforeSubmit: [...cur.support],
    feedbackShown: false,
    outcome: 'skipped',
    errorType: null,
    evalSource: 'skip',
    hebrewPrompt: Boolean(item.promptHe),
    assisted: false,
    retention: null,
    excluded: false,
    reportReason: null,
  };
  const slots = [...seg.slots];
  const slot = slots[cur.slotIndex];
  if (slot) slots[cur.slotIndex] = { ...slot, status: 'skipped', outcome: 'skipped' };
  const c1: Change = { attempts: [attempt] };
  return merge(c1, enterSlot(applyChange(snap, c1), env, { ...seg, slots, current: null, dialogue: null }, cur.slotIndex + 1));
}

/* ---------------------------------------------------------------- reports */

export function reportProblem(snap: Snapshot, env: Env, reason: ReportReason): Change {
  const seg = snap.active;
  const cur = seg?.current;
  if (!seg || !cur) return {};
  const related = snap.attempts.filter(
    (a) => a.segmentId === seg.segmentId && a.itemId === cur.item.id && a.turn === cur.turn,
  );
  const excluded = related.map((a) => ({ ...a, excluded: true, reportReason: reason }));
  const u = currentUnit(cur);
  let units: UnitState[] | undefined;
  const eligibleMain = related.find((a) => a.kind === 'main' && a.retention?.eligible);
  if (eligibleMain?.retention) {
    const us = unit(snap, u);
    const retention = us.retention.filter((r) => !(r.itemId === cur.item.id && r.at === eligibleMain.submittedAt));
    const step = eligibleMain.retention.stepBefore;
    units = [{ ...us, retention, step, dueAt: step >= 0 ? env.now + intervalMs(step) : us.dueAt }];
  }
  const report = {
    reportId: randomId('rep'),
    at: env.now,
    itemId: cur.item.id,
    itemVersion: cur.item.v,
    turn: cur.turn,
    reason,
    attemptIds: related.map((a) => a.attemptId),
    answerText: related[related.length - 1]?.answerText ?? null,
    status: 'open' as const,
  };
  const base: Change = {
    attempts: excluded,
    reports: [report],
    events: [event('report', env.now, { itemId: cur.item.id, reason })],
  };
  if (units) base.units = units;
  if (seg.phase === 'task') {
    // reported before answering: move on without counting anything
    const slots = [...seg.slots];
    const slot = slots[cur.slotIndex];
    if (slot) slots[cur.slotIndex] = { ...slot, status: 'skipped', outcome: 'skipped' };
    return merge(base, enterSlot(applyChange(snap, base), env, { ...seg, slots, current: null, dialogue: null }, cur.slotIndex + 1));
  }
  return base;
}

/* ------------------------------------------------------------------ finish */

function buildSummary(snap: Snapshot, seg: ActiveSegment, now: number, completed: boolean, early: SegmentSummary['endedEarlyReason']): SegmentSummary {
  const atts = snap.attempts.filter((a) => a.segmentId === seg.segmentId && !a.excluded);
  const main = atts.filter((a) => a.kind === 'main' && a.outcome !== 'skipped');
  const practicedMap = new Map<UnitId, number>();
  for (const a of main) practicedMap.set(a.unit, (practicedMap.get(a.unit) ?? 0) + 1);
  const firstTry: SegmentSummary['firstTry'] = [];
  for (const u of practicedMap.keys()) {
    const decisive = main.filter((a) => a.unit === u && (isSuccess(a.outcome) || isFailure(a.outcome)));
    const ok = decisive.filter((a) => isSuccess(a.outcome) && !usedGrammarSupport(a.supportBeforeSubmit));
    firstTry.push({ unit: u, ok: ok.length, total: decisive.length, example: ok[0]?.answerText ?? null });
  }
  const errorUnits = new Set(main.filter((a) => isFailure(a.outcome)).map((a) => a.unit));
  const toCheck: SegmentSummary['toCheck'] = [...errorUnits].map((u) => ({ unit: u, why: 'errors' as const, dueAt: null }));
  for (const us of Object.values(snap.units)) {
    if (us.dueAt !== null && us.step >= 0 && !errorUnits.has(us.unit) && us.dueAt < now + 3 * 24 * HOUR) {
      toCheck.push({ unit: us.unit, why: 'scheduled', dueAt: us.dueAt });
    }
  }
  toCheck.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const tasksPlanned = seg.slots.filter((s) => s.status !== 'skipped' || s.outcome === 'skipped').length;
  const segmentsAfter = snap.profile.segmentsCompleted + (completed ? 1 : 0);
  return {
    segmentId: seg.segmentId,
    kind: seg.kind,
    size: seg.size,
    focusUnit: seg.focusUnit,
    startedAt: seg.createdAt,
    endedAt: now,
    completed,
    endedEarlyReason: early,
    tasksDone: seg.slots.filter((s) => s.status === 'done').length,
    tasksPlanned,
    practiced: [...practicedMap.entries()].map(([unit, count]) => ({ unit, count })),
    firstTry,
    toCheck: toCheck.slice(0, 6),
    difficulty: null,
    askDifficulty:
      completed && seg.kind === 'regular' && segmentsAfter > 0 && segmentsAfter % CONFIG.difficultyPromptEvery === 0,
  };
}

function calibrationEffects(profile: Profile): Profile {
  const r = profile.calibrationResults;
  const failed = (u: UnitId) => {
    const o: Outcome | undefined = r[u];
    return o !== undefined && isFailure(o);
  };
  let p: Profile = { ...profile, calibration: 'done' };
  if (failed('S01')) p = { ...p, bridgeNeeds: { ...p.bridgeNeeds, S01: 2 } };
  const promote = (['S06', 'S08'] as UnitId[]).filter(failed).filter((u) => !p.promotedUnits.includes(u));
  if (promote.length) p = { ...p, promotedUnits: [...p.promotedUnits, ...promote] };
  return p;
}

function finishSegment(snap: Snapshot, env: Env, seg: ActiveSegment, early: SegmentSummary['endedEarlyReason']): Change {
  const completed = early === null || early === 'content_exhausted';
  const summary = buildSummary(snap, seg, env.now, completed, early);
  let profile: Profile = snap.profile;
  if (seg.kind === 'calibration') {
    profile = calibrationEffects(profile);
  } else {
    const bridgeNeeds: Profile['bridgeNeeds'] = {};
    for (const [u, n] of Object.entries(profile.bridgeNeeds) as [UnitId, number][]) {
      if (n > 1) bridgeNeeds[u] = n - 1;
    }
    const leftover = seg.pendingRechecks.map((r) => r.unit);
    profile = {
      ...profile,
      bridgeNeeds,
      segmentsCompleted: profile.segmentsCompleted + (completed ? 1 : 0),
      firstSegmentDone: profile.firstSegmentDone || (seg.kind === 'first' && completed),
      recheckNext: [...new Set([...profile.recheckNext, ...leftover])],
    };
  }
  const done: ActiveSegment = { ...seg, phase: 'summary', current: null, summary };
  return {
    active: bump(done, env.now),
    segments: [summary],
    profile,
    events: [
      event(completed ? 'segment_completed' : 'segment_ended_early', env.now, {
        kind: seg.kind,
        tasks: summary.tasksDone,
        reason: early,
      }),
    ],
  };
}

/** Pause: keep everything as it is; "continue" on the home screen resumes at the same point. */
export function pauseSegment(_snap: Snapshot, env: Env): Change {
  return { events: [event('segment_paused', env.now)] };
}

/** End the segment now and show its summary. */
export function endSegmentEarly(snap: Snapshot, env: Env): Change {
  const seg = snap.active;
  if (!seg || seg.phase === 'summary') return {};
  const slots = seg.slots.map((s) => (s.status === 'active' ? { ...s, status: 'pending' as const } : s));
  return finishSegment(snap, env, { ...seg, slots }, 'stopped');
}

export function closeSummary(snap: Snapshot, _env: Env): Change {
  if (!snap.active || snap.active.phase !== 'summary') return {};
  return { active: null };
}

export function rateDifficulty(snap: Snapshot, env: Env, rating: 'too_easy' | 'fits' | 'too_hard'): Change {
  const seg = snap.active;
  if (!seg?.summary) return {};
  const s = seg.summary;
  const total = s.firstTry.reduce((n, f) => n + f.total, 0);
  const ok = s.firstTry.reduce((n, f) => n + f.ok, 0);
  const rate = total ? ok / total : 0;
  // the adjustment leans on performance as well as on the report
  const bias: Profile['difficultyBias'] = rating === 'too_easy' && rate >= 0.7 ? 1 : rating === 'too_hard' && rate <= 0.7 ? -1 : 0;
  const summary = { ...s, difficulty: rating };
  return {
    active: bump({ ...seg, summary }, env.now),
    segments: [summary],
    profile: { ...snap.profile, difficultyBias: bias },
    events: [event('difficulty', env.now, { rating, rate: Math.round(rate * 100) })],
  };
}

/** Evidence helper re-exported for the UI. */
export { unitEvidence };
