import type { DialogueItem, Item, UnitId } from '../content/schema';
import { UNIT_BY_ID } from '../content/units';
import {
  BRIDGE_UNITS,
  CONFIG,
  FIRST_SEGMENT_PREFS,
  FOCUS_ORDER,
  PROBE_ORDER,
  SLOT_TEMPLATES,
  type SegmentSize,
} from './config';
import { isFailure, isSuccess } from './evaluate';
import { isUnitDone, unitEvidence } from './progress';
import { hashString } from './rng';
import { isDue } from './schedule';
import type { ActiveSegment, ReasonCode, Slot, SlotRole, Snapshot } from './types';

export interface ContentIndex {
  items: readonly Item[];
  byId: ReadonlyMap<string, Item>;
}

export function makeIndex(items: readonly Item[]): ContentIndex {
  return { items, byId: new Map(items.map((i) => [i.id, i])) };
}

/* ------------------------------------------------------------------ focus */

export interface FocusChoice {
  unit: UnitId;
  reason: ReasonCode;
}

export function unitDone(snap: Snapshot, unit: UnitId): boolean {
  return isUnitDone(unitEvidence(unit, snap.attempts, snap.units[unit]));
}

/**
 * The unit taught in the next segment. The current focus continues until it meets the
 * advancement rule (or reaches the soft cap); then promoted units, then the curriculum order.
 */
export function chooseFocus(snap: Snapshot): FocusChoice {
  const cur = snap.profile.currentFocus;
  if (cur && !unitDone(snap, cur) && (snap.units[cur]?.focusSegments ?? 0) < CONFIG.maxFocusSegments) {
    return { unit: cur, reason: 'focus_continue' };
  }
  const candidates = [...snap.profile.promotedUnits, ...FOCUS_ORDER].filter(
    (u, i, arr) => arr.indexOf(u) === i && u !== cur,
  );
  const open = candidates.filter((u) => !unitDone(snap, u));
  const fresh = open.find((u) => (snap.units[u]?.focusSegments ?? 0) < CONFIG.maxFocusSegments);
  if (fresh) return { unit: fresh, reason: 'focus_new' };
  if (open[0]) return { unit: open[0], reason: 'focus_continue' };
  // everything meets the rule: keep practising the unit whose last delayed check is oldest
  const byDue = [...FOCUS_ORDER].sort((a, b) => (snap.units[a]?.dueAt ?? 0) - (snap.units[b]?.dueAt ?? 0));
  return { unit: byDue[0] ?? 'S03', reason: 'focus_continue' };
}

/* --------------------------------------------------------------- planning */

export function planSlots(size: SegmentSize): Slot[] {
  return SLOT_TEMPLATES[size].map((role) => ({
    role: role as SlotRole,
    itemId: null,
    turn: null,
    unit: null,
    reason: null,
    status: 'pending',
    outcome: null,
    familiar: false,
  }));
}

export function needsExplanation(snap: Snapshot, unit: UnitId): boolean {
  const us = snap.units[unit];
  if (!us) return false;
  if (us.lessonShownAt === null) return true;
  // struggled in the last segment that had this focus: a short reminder first
  const last = [...snap.segments].reverse().find((s) => s.focusUnit === unit && s.kind !== 'calibration');
  if (!last) return false;
  const fails = snap.attempts.filter(
    (a) => a.segmentId === last.segmentId && a.unit === unit && a.kind === 'main' && isFailure(a.outcome),
  ).length;
  return fails >= 3;
}

/* ------------------------------------------------------- item candidates */

interface Pick {
  itemId: string;
  turn: number | null;
  unit: UnitId;
  reason: ReasonCode;
  familiar: boolean;
}

function segmentItemIds(seg: ActiveSegment): Set<string> {
  return new Set(seg.slots.map((s) => s.itemId).filter((x): x is string => Boolean(x)));
}

function segmentFams(seg: ActiveSegment, idx: ContentIndex): Set<string> {
  const out = new Set<string>();
  for (const s of seg.slots) {
    const it = s.itemId ? idx.byId.get(s.itemId) : undefined;
    if (it) out.add(it.fam);
  }
  return out;
}

function segmentContexts(seg: ActiveSegment, idx: ContentIndex): Set<string> {
  const out = new Set<string>();
  for (const s of seg.slots) {
    const it = s.itemId ? idx.byId.get(s.itemId) : undefined;
    if (it) out.add(it.ctx);
  }
  return out;
}

function seen(snap: Snapshot, itemId: string): boolean {
  return Boolean(snap.exposures[itemId]);
}

function famSeen(snap: Snapshot, idx: ContentIndex, fam: string): boolean {
  return Object.keys(snap.exposures).some((id) => idx.byId.get(id)?.fam === fam);
}

/** contexts of this unit's items in the most recent earlier segment that practised it */
export function lastSessionContexts(snap: Snapshot, unit: UnitId, currentSegment: string): Set<string> {
  const prior = snap.attempts.filter((a) => a.unit === unit && a.segmentId !== currentSegment);
  if (prior.length === 0) return new Set();
  const lastSeg = prior.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a)).segmentId;
  return new Set(prior.filter((a) => a.segmentId === lastSeg).map((a) => a.ctx));
}

function tieBreak(seg: ActiveSegment, id: string): number {
  return hashString(`${seg.segmentId}:${id}`);
}

/** Stage the next focus item should have, from this segment's results and the unit's evidence. */
export function targetStage(snap: Snapshot, seg: ActiveSegment, unit: UnitId): 1 | 2 | 3 {
  const results = seg.slots.filter((s) => s.unit === unit && s.status === 'done' && s.outcome);
  const lastTwo = results.slice(-2).map((s) => s.outcome);
  const bias = snap.profile.difficultyBias;
  const ev = unitEvidence(unit, snap.attempts, snap.units[unit]);
  let stage: number = ev.build.ok >= 2 || bias > 0 ? 2 : 1;
  const done = results.length;
  stage += Math.floor(done / 2);
  if (lastTwo.length === 2 && lastTwo.every((o) => o && isSuccess(o))) stage += 1;
  const lastOutcome = lastTwo[lastTwo.length - 1];
  if (lastOutcome && isFailure(lastOutcome)) stage -= 1;
  if (bias < 0) stage -= 1;
  return Math.max(1, Math.min(3, stage)) as 1 | 2 | 3;
}

interface CandidateOpts {
  unit: UnitId;
  roles: readonly Item['role'][];
  allowDialogue?: boolean;
  onlyDialogue?: boolean;
  stage?: 1 | 2 | 3;
  minStage?: 1 | 2 | 3;
  avoidContexts?: ReadonlySet<string>;
}

function candidates(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, o: CandidateOpts): Item[] {
  const used = segmentItemIds(seg);
  const fams = segmentFams(seg, idx);
  return idx.items.filter((it) => {
    if (it.unit !== o.unit && !(it.type === 'dialogue' && o.onlyDialogue && dialogueTouches(it, o.unit))) return false;
    if (!o.roles.includes(it.role)) return false;
    if (used.has(it.id) || fams.has(it.fam)) return false;
    if (o.onlyDialogue && it.type !== 'dialogue') return false;
    if (!o.onlyDialogue && !o.allowDialogue && it.type === 'dialogue') return false;
    if (o.minStage && it.stage < o.minStage) return false;
    return true;
  });
}

function dialogueTouches(it: Item, unit: UnitId): boolean {
  return it.type === 'dialogue' && (it.unit === unit || (it as DialogueItem).turns.some((t) => t.unit === unit));
}

/** Rank: unseen first, then preferred stage, then contexts not used in this segment, then least recent. */
function rank(snap: Snapshot, seg: ActiveSegment, list: Item[], stage: number | undefined, avoid: ReadonlySet<string>): Item[] {
  return [...list].sort((a, b) => {
    const sa = seen(snap, a.id) ? 1 : 0;
    const sb = seen(snap, b.id) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (stage !== undefined) {
      const da = Math.abs(a.stage - stage);
      const db = Math.abs(b.stage - stage);
      if (da !== db) return da - db;
    }
    const ca = avoid.has(a.ctx) ? 1 : 0;
    const cb = avoid.has(b.ctx) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const la = snap.exposures[a.id]?.lastAt ?? 0;
    const lb = snap.exposures[b.id]?.lastAt ?? 0;
    if (la !== lb) return la - lb;
    return tieBreak(seg, a.id) - tieBreak(seg, b.id);
  });
}

function pickFrom(
  snap: Snapshot,
  idx: ContentIndex,
  seg: ActiveSegment,
  o: CandidateOpts,
  reason: ReasonCode,
  allowFamiliar = true,
): Pick | null {
  const list = candidates(snap, idx, seg, o);
  const avoid = o.avoidContexts ?? segmentContexts(seg, idx);
  const ranked = rank(snap, seg, list, o.stage, avoid);
  const best = ranked[0];
  if (!best) return null;
  const familiar = seen(snap, best.id);
  if (familiar && !allowFamiliar) return null;
  // the reason stays what the slot needed; `familiar` marks that the item itself was seen before
  return {
    itemId: best.id,
    turn: best.type === 'dialogue' ? 0 : null,
    unit: best.type === 'dialogue' ? firstTurnUnit(best) : best.unit,
    reason,
    familiar,
  };
}

function firstTurnUnit(it: Item): UnitId {
  if (it.type !== 'dialogue') return it.unit;
  return it.turns[0]?.unit ?? it.unit;
}

export function turnUnit(it: Item, turn: number | null): UnitId {
  if (it.type !== 'dialogue' || turn === null) return it.unit;
  return it.turns[turn]?.unit ?? it.unit;
}

/* ------------------------------------------------------------ slot filling */

function preferred(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, ids: readonly string[], reason: ReasonCode): Pick | null {
  const used = segmentItemIds(seg);
  for (const id of ids) {
    const it = idx.byId.get(id);
    if (!it || used.has(id) || seen(snap, id)) continue;
    return { itemId: id, turn: it.type === 'dialogue' ? 0 : null, unit: firstTurnUnit(it), reason, familiar: false };
  }
  return null;
}

function reviewUnits(snap: Snapshot, seg: ActiveSegment, now: number): { unit: UnitId; reason: ReasonCode }[] {
  const focus = seg.focusUnit;
  const alreadyReviewed = new Set(seg.slots.filter((s) => s.role === 'review' && s.unit).map((s) => s.unit as UnitId));
  const out: { unit: UnitId; reason: ReasonCode }[] = [];
  // 1. units flagged for a re-check after errors in an earlier segment
  for (const u of snap.profile.recheckNext) out.push({ unit: u, reason: 'recheck_after_error' });
  // 2. due units, most overdue first
  const due = Object.values(snap.units)
    .filter((us) => us.unit !== focus && isDue(us, now))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  for (const us of due) out.push({ unit: us.unit, reason: 'due_review' });
  // 3. taught-before units never attempted in the app: probe them
  for (const u of PROBE_ORDER) {
    if (u === focus || BRIDGE_UNITS.includes(u)) continue;
    if (UNIT_BY_ID[u].prior === 'none') continue;
    if (snap.attempts.some((a) => a.unit === u)) continue;
    out.push({ unit: u, reason: 'probe_prior' });
  }
  const seenUnits = new Set<UnitId>();
  return out.filter((c) => {
    if (seenUnits.has(c.unit)) return false;
    seenUnits.add(c.unit);
    return !alreadyReviewed.has(c.unit);
  });
}

function fillReview(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, now: number): Pick | null {
  const distinct = new Set(seg.slots.filter((s) => s.role === 'review' && s.unit).map((s) => s.unit));
  for (const c of reviewUnits(snap, seg, now)) {
    if (distinct.size >= CONFIG.reviewUnitsAtOpening && !distinct.has(c.unit)) continue;
    const avoid = lastSessionContexts(snap, c.unit, seg.segmentId);
    const roles: Item['role'][] = c.reason === 'due_review' ? ['check', 'practice'] : ['practice'];
    const minStage = c.reason === 'probe_prior' ? 2 : undefined;
    const p =
      pickFrom(snap, idx, seg, { unit: c.unit, roles, stage: 2, ...(minStage ? { minStage } : {}), avoidContexts: avoid }, c.reason) ??
      pickFrom(snap, idx, seg, { unit: c.unit, roles, stage: 2, avoidContexts: avoid }, c.reason);
    if (p) return p;
  }
  // nothing due or to probe: a retrieval item of the focus unit (if it was practised before)
  if (seg.focusUnit && snap.attempts.some((a) => a.unit === seg.focusUnit)) {
    return pickFrom(snap, idx, seg, { unit: seg.focusUnit, roles: ['practice'], stage: 2 }, 'due_review');
  }
  return null;
}

function fillFocus(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, slotIndex: number): Pick | null {
  const unit = seg.focusUnit;
  if (!unit) return null;
  const recheck = takeRecheck(snap, idx, seg, slotIndex);
  if (recheck) return recheck;
  const stage = targetStage(snap, seg, unit);
  return pickFrom(snap, idx, seg, { unit, roles: ['practice'], stage }, seg.slots.some((s) => s.unit === unit && s.status === 'done') ? 'focus_continue' : 'focus_new');
}

function takeRecheck(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, slotIndex: number): Pick | null {
  const due = seg.pendingRechecks.find((r) => slotIndex >= r.notBefore);
  if (!due) return null;
  return pickFrom(snap, idx, seg, { unit: due.unit, roles: ['practice'], stage: 2 }, 'recheck_after_error');
}

function fillMixed(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, slotIndex: number, now: number): Pick | null {
  const focus = seg.focusUnit;
  const recheck = takeRecheck(snap, idx, seg, slotIndex);
  if (recheck) return recheck;
  const mixedDone = seg.slots.filter((s, i) => s.role === 'mixed' && i < slotIndex).length;
  const neighbors = focus ? UNIT_BY_ID[focus].neighbors : [];
  // bridge units needed after missing-auxiliary errors (only where they are connected to the focus)
  for (const [u, n] of Object.entries(snap.profile.bridgeNeeds) as [UnitId, number][]) {
    if (!n || !neighbors.includes(u)) continue;
    if (seg.slots.some((s) => s.unit === u && s.reason === 'bridge_need')) continue;
    const p = pickFrom(snap, idx, seg, { unit: u, roles: ['practice'], stage: 1 }, 'bridge_need');
    if (p) return p;
  }
  // due units that did not fit into the opening
  const due = Object.values(snap.units)
    .filter((us) => us.unit !== focus && isDue(us, now) && !seg.slots.some((s) => s.unit === us.unit))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  for (const us of due) {
    const p = pickFrom(snap, idx, seg, { unit: us.unit, roles: ['check', 'practice'], stage: 2, avoidContexts: lastSessionContexts(snap, us.unit, seg.segmentId) }, 'due_review', false);
    if (p) return p;
  }
  // alternate: focus contrast, then a neighbour
  if (focus && mixedDone % 2 === 0) {
    const p = pickFrom(snap, idx, seg, { unit: focus, roles: ['practice'], stage: 3 }, 'focus_contrast', false);
    if (p) return p;
  }
  const rotation = [...neighbors].sort(
    (a, b) => seg.slots.filter((s) => s.unit === a).length - seg.slots.filter((s) => s.unit === b).length,
  );
  for (const u of rotation) {
    if (BRIDGE_UNITS.includes(u) && !(snap.profile.bridgeNeeds[u] ?? 0)) continue;
    const p = pickFrom(snap, idx, seg, { unit: u, roles: ['practice'], stage: 2 }, 'neighbor_mix', false);
    if (p) return p;
  }
  if (focus) {
    return (
      pickFrom(snap, idx, seg, { unit: focus, roles: ['practice'], stage: 3 }, 'focus_contrast', false) ??
      pickFrom(snap, idx, seg, { unit: focus, roles: ['practice'], stage: 2 }, 'focus_continue')
    );
  }
  return null;
}

function fillDialogue(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, slotIndex: number): Pick | null {
  // continue a running dialogue
  const d = seg.dialogue;
  if (d) {
    const it = idx.byId.get(d.itemId);
    if (it && it.type === 'dialogue' && d.turn + 1 < it.turns.length) {
      return { itemId: it.id, turn: d.turn + 1, unit: turnUnit(it, d.turn + 1), reason: 'dialogue', familiar: seen(snap, it.id) };
    }
  }
  const focus = seg.focusUnit;
  const order: UnitId[] = focus ? [focus, ...UNIT_BY_ID[focus].neighbors] : [];
  for (const u of order) {
    const p = pickFrom(snap, idx, seg, { unit: u, roles: ['practice'], onlyDialogue: true }, 'dialogue', false);
    if (p) return p;
  }
  // no fresh dialogue: a situation item of the focus instead
  return focus ? fillFocus(snap, idx, seg, slotIndex) : null;
}

function fillExit(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment): Pick | null {
  const focus = seg.focusUnit;
  if (!focus) return null;
  const avoid = segmentContexts(seg, idx);
  return (
    pickFrom(snap, idx, seg, { unit: focus, roles: ['check'], stage: 2, avoidContexts: avoid }, 'exit_check', false) ??
    pickFrom(snap, idx, seg, { unit: focus, roles: ['practice'], minStage: 2, stage: 2, avoidContexts: avoid }, 'exit_check', false) ??
    pickFrom(snap, idx, seg, { unit: focus, roles: ['practice', 'check'], stage: 2, avoidContexts: avoid }, 'exit_check')
  );
}

/** Choose the item for a slot (deterministic). Null when no suitable content exists. */
export function fillSlot(snap: Snapshot, idx: ContentIndex, seg: ActiveSegment, slotIndex: number, now: number): Pick | null {
  const slot = seg.slots[slotIndex];
  if (!slot) return null;
  if (slot.role === 'calibration') return null;
  if (seg.kind === 'first') {
    // a re-check after an error takes precedence over the script — except in the middle of a
    // sentence built in two parts (same variant family, second part has a lead)
    if (slot.role === 'focus' || slot.role === 'mixed') {
      const prevItem = idx.byId.get(seg.slots[slotIndex - 1]?.itemId ?? '');
      const nextPref = preferred(snap, idx, seg, FIRST_SEGMENT_PREFS[slot.role], 'first_segment');
      const nextItem = nextPref ? idx.byId.get(nextPref.itemId) : undefined;
      if (nextPref && prevItem && nextItem && prevItem.fam === nextItem.fam) return nextPref;
      const r = takeRecheck(snap, idx, seg, slotIndex);
      if (r) return r;
    }
    const prefs =
      slot.role === 'review'
        ? seg.size === 'short'
          ? FIRST_SEGMENT_PREFS.reviewShort
          : FIRST_SEGMENT_PREFS.review
        : slot.role === 'dialogue' && seg.dialogue
          ? []
          : FIRST_SEGMENT_PREFS[slot.role as 'focus' | 'mixed' | 'dialogue' | 'exit'] ?? [];
    const p = preferred(snap, idx, seg, prefs, 'first_segment');
    if (p) return p;
  }
  switch (slot.role) {
    case 'review':
      return fillReview(snap, idx, seg, now) ?? fillFocus(snap, idx, seg, slotIndex);
    case 'focus':
      return fillFocus(snap, idx, seg, slotIndex) ?? fillMixed(snap, idx, seg, slotIndex, now);
    case 'mixed':
      return fillMixed(snap, idx, seg, slotIndex, now);
    case 'dialogue':
      return fillDialogue(snap, idx, seg, slotIndex) ?? fillMixed(snap, idx, seg, slotIndex, now);
    case 'exit':
      return fillExit(snap, idx, seg);
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- texts */

export const REASON_HE: Readonly<Record<ReasonCode, string>> = {
  calibration: 'בדיקת כיול קצרה',
  first_segment: 'המקטע הראשון: שרשרת הפועל ושאלת משך',
  due_review: 'חזרה מתוזמנת',
  probe_prior: 'בדיקה של נושא שלמדת בעבר',
  focus_continue: 'ממשיכים במוקד',
  focus_new: 'מוקד חדש',
  bridge_need: 'גשר קצר',
  recheck_after_error: 'בדיקה חוזרת אחרי טעות',
  neighbor_mix: 'שילוב עם נושא קרוב',
  focus_contrast: 'הבחנה בין מבנים קרובים',
  exit_check: 'בדיקת יציאה',
  dialogue: 'דיאלוג קצר',
  familiar_review: 'חזרה מוכרת',
  content_exhausted: 'נגמר התוכן החדש',
};

export const ROLE_HE: Readonly<Record<SlotRole, string>> = {
  calibration: 'כיול',
  review: 'חזרה',
  focus: 'תרגול',
  mixed: 'שילוב',
  dialogue: 'דיאלוג',
  exit: 'בדיקת יציאה',
};
