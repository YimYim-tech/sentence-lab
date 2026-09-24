import type { UnitId } from '../content/schema';
import { UNITS } from '../content/units';
import type { Change, Profile, Settings, Snapshot, UnitState } from './types';

export const SCHEMA_VERSION = 1;

export function defaultProfile(now: number): Profile {
  return {
    createdAt: now,
    onboardingDone: false,
    calibration: 'pending',
    calibrationResults: {},
    firstSegmentDone: false,
    segmentsCompleted: 0,
    currentFocus: null,
    promotedUnits: [],
    bridgeNeeds: {},
    recheckNext: [],
    difficultyBias: 0,
    persistRequested: false,
  };
}

export function defaultSettings(): Settings {
  return { textSize: 'normal', theme: 'system', defaultSize: 'regular', thinkFirst: false };
}

export function defaultUnitState(unit: UnitId): UnitState {
  return {
    unit,
    lessonShownAt: null,
    lastTeachAt: null,
    step: -1,
    dueAt: null,
    lastAdvanceDay: null,
    focusSegments: 0,
    lastFocusAt: null,
    retention: [],
  };
}

export function defaultUnits(): Record<UnitId, UnitState> {
  return Object.fromEntries(UNITS.map((u) => [u.id, defaultUnitState(u.id)])) as Record<UnitId, UnitState>;
}

export function emptySnapshot(now: number): Snapshot {
  return {
    profile: defaultProfile(now),
    settings: defaultSettings(),
    units: defaultUnits(),
    attempts: [],
    exposures: {},
    active: null,
    segments: [],
    reports: [],
    events: [],
  };
}

function mergeBy<T>(list: readonly T[], updates: readonly T[] | undefined, key: (t: T) => string): T[] {
  if (!updates || updates.length === 0) return list as T[];
  const index = new Map(list.map((t, i) => [key(t), i]));
  const out = [...list];
  for (const u of updates) {
    const i = index.get(key(u));
    if (i === undefined) {
      index.set(key(u), out.length);
      out.push(u);
    } else {
      out[i] = u;
    }
  }
  return out;
}

/** Apply an engine change to the in-memory snapshot (the same change the storage layer commits). */
export function applyChange(snap: Snapshot, change: Change): Snapshot {
  const units = { ...snap.units };
  for (const u of change.units ?? []) units[u.unit] = u;
  const exposures = { ...snap.exposures };
  for (const e of change.exposures ?? []) exposures[e.itemId] = e;
  return {
    profile: change.profile ?? snap.profile,
    settings: change.settings ?? snap.settings,
    units,
    attempts: mergeBy(snap.attempts, change.attempts, (a) => a.attemptId),
    exposures,
    active: change.active === undefined ? snap.active : change.active,
    segments: mergeBy(snap.segments, change.segments, (s) => s.segmentId),
    reports: mergeBy(snap.reports, change.reports, (r) => r.reportId),
    events: mergeBy(snap.events, change.events, (e) => e.id),
  };
}
