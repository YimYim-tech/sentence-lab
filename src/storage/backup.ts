/**
 * Backup file format, validation and migration. Pure functions (no IndexedDB) so they can be
 * tested directly. An imported file is data only: nothing in it is ever executed or rendered as HTML.
 */
import type { Item, Outcome, UnitId } from '../content/schema';
import { UNIT_BY_ID } from '../content/units';
import { CONFIG } from '../engine/config';
import { defaultProfile, defaultSettings, defaultUnits, SCHEMA_VERSION } from '../engine/snapshot';
import type {
  ActiveSegment,
  AttemptRecord,
  EventRecord,
  Exposure,
  Profile,
  ReportRecord,
  SegmentSummary,
  Settings,
  Snapshot,
  UnitState,
} from '../engine/types';

export interface BackupFile {
  app: 'sentence-lab';
  schemaVersion: number;
  contentVersion: string;
  exportedAt: string;
  data: {
    profile: Profile;
    settings: Settings;
    units: UnitState[];
    attempts: AttemptRecord[];
    exposures: Exposure[];
    active: ActiveSegment | null;
    segments: SegmentSummary[];
    reports: ReportRecord[];
    events: EventRecord[];
  };
}

export function toBackup(snap: Snapshot, contentVersion: string, now: number): BackupFile {
  return {
    app: 'sentence-lab',
    schemaVersion: SCHEMA_VERSION,
    contentVersion,
    exportedAt: new Date(now).toISOString(),
    data: {
      profile: snap.profile,
      settings: snap.settings,
      units: Object.values(snap.units),
      attempts: snap.attempts,
      exposures: Object.values(snap.exposures),
      active: snap.active,
      segments: snap.segments,
      reports: snap.reports,
      events: snap.events,
    },
  };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `sentence-lab-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/* ------------------------------------------------------------- validation */

class Invalid extends Error {}

const OUTCOMES: ReadonlySet<Outcome> = new Set<Outcome>([
  'correct_target',
  'valid_alternative',
  'target_not_used',
  'meaning_mismatch',
  'form_error',
  'unverified',
  'skipped',
]);

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid(`${where}: expected an object`);
  return v as Obj;
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Invalid(`${where}: expected a list`);
  return v;
}
function str(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Invalid(`${where}: expected text`);
  if (v.length > 5000) throw new Invalid(`${where}: text too long`);
  return v;
}
function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Invalid(`${where}: expected a number`);
  return v;
}
function numOrNull(v: unknown, where: string): number | null {
  return v === null || v === undefined ? null : num(v, where);
}
function strOrNull(v: unknown, where: string): string | null {
  return v === null || v === undefined ? null : str(v, where);
}
function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new Invalid(`${where}: expected true/false`);
  return v;
}
function strList(v: unknown, where: string): string[] {
  return arr(v, where).map((x, i) => str(x, `${where}[${i}]`));
}
function unitId(v: unknown, where: string): UnitId {
  const s = str(v, where);
  if (!(s in UNIT_BY_ID)) throw new Invalid(`${where}: unknown unit ${s}`);
  return s as UnitId;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
  const s = str(v, where);
  if (!allowed.includes(s as T)) throw new Invalid(`${where}: unexpected value`);
  return s as T;
}

function parseProfile(v: unknown): Profile {
  const o = obj(v, 'profile');
  const base = defaultProfile(num(o.createdAt, 'profile.createdAt'));
  const results: Profile['calibrationResults'] = {};
  const cr = obj(o.calibrationResults ?? {}, 'profile.calibrationResults');
  for (const [k, val] of Object.entries(cr)) {
    const u = unitId(k, 'profile.calibrationResults');
    const out = str(val, 'profile.calibrationResults');
    if (!OUTCOMES.has(out as Outcome)) throw new Invalid('profile.calibrationResults: bad outcome');
    results[u] = out as Outcome;
  }
  const bridge: Profile['bridgeNeeds'] = {};
  for (const [k, val] of Object.entries(obj(o.bridgeNeeds ?? {}, 'profile.bridgeNeeds'))) {
    bridge[unitId(k, 'profile.bridgeNeeds')] = num(val, 'profile.bridgeNeeds');
  }
  const bias = num(o.difficultyBias ?? 0, 'profile.difficultyBias');
  return {
    ...base,
    onboardingDone: bool(o.onboardingDone, 'profile.onboardingDone'),
    calibration: oneOf(o.calibration, ['pending', 'done', 'skipped'] as const, 'profile.calibration'),
    calibrationResults: results,
    firstSegmentDone: bool(o.firstSegmentDone, 'profile.firstSegmentDone'),
    segmentsCompleted: num(o.segmentsCompleted, 'profile.segmentsCompleted'),
    currentFocus: o.currentFocus === null || o.currentFocus === undefined ? null : unitId(o.currentFocus, 'profile.currentFocus'),
    promotedUnits: arr(o.promotedUnits ?? [], 'profile.promotedUnits').map((x) => unitId(x, 'profile.promotedUnits')),
    bridgeNeeds: bridge,
    recheckNext: arr(o.recheckNext ?? [], 'profile.recheckNext').map((x) => unitId(x, 'profile.recheckNext')),
    difficultyBias: bias > 0 ? 1 : bias < 0 ? -1 : 0,
    persistRequested: Boolean(o.persistRequested),
  };
}

function parseSettings(v: unknown): Settings {
  const o = obj(v ?? {}, 'settings');
  const d = defaultSettings();
  return {
    textSize: o.textSize === undefined ? d.textSize : oneOf(o.textSize, ['normal', 'large', 'larger'] as const, 'settings.textSize'),
    theme: o.theme === undefined ? d.theme : oneOf(o.theme, ['system', 'light', 'dark'] as const, 'settings.theme'),
    defaultSize: o.defaultSize === undefined ? d.defaultSize : oneOf(o.defaultSize, ['short', 'regular', 'deep'] as const, 'settings.defaultSize'),
    thinkFirst: o.thinkFirst === undefined ? d.thinkFirst : bool(o.thinkFirst, 'settings.thinkFirst'),
  };
}

function parseUnit(v: unknown, i: number): UnitState {
  const w = `units[${i}]`;
  const o = obj(v, w);
  return {
    unit: unitId(o.unit, `${w}.unit`),
    lessonShownAt: numOrNull(o.lessonShownAt, `${w}.lessonShownAt`),
    lastTeachAt: numOrNull(o.lastTeachAt, `${w}.lastTeachAt`),
    step: num(o.step, `${w}.step`),
    dueAt: numOrNull(o.dueAt, `${w}.dueAt`),
    lastAdvanceDay: strOrNull(o.lastAdvanceDay, `${w}.lastAdvanceDay`),
    focusSegments: num(o.focusSegments ?? 0, `${w}.focusSegments`),
    lastFocusAt: numOrNull(o.lastFocusAt, `${w}.lastFocusAt`),
    retention: arr(o.retention ?? [], `${w}.retention`).map((r, k) => {
      const x = obj(r, `${w}.retention[${k}]`);
      return {
        at: num(x.at, 'retention.at'),
        hours: num(x.hours, 'retention.hours'),
        ok: bool(x.ok, 'retention.ok'),
        stepBefore: num(x.stepBefore, 'retention.stepBefore'),
        stepAfter: num(x.stepAfter, 'retention.stepAfter'),
        itemId: str(x.itemId, 'retention.itemId'),
      };
    }),
  };
}

const TASK_TYPES = ['assemble', 'correct', 'transform', 'discriminate', 'dialogue'] as const;
const ROLES = ['practice', 'check', 'calibration'] as const;
const SLOT_ROLES = ['calibration', 'review', 'focus', 'mixed', 'dialogue', 'exit'] as const;
const SUPPORT = ['hint', 'why', 'difference', 'example', 'translation', 'scaffold', 'model'] as const;

function parseAttempt(v: unknown, i: number): AttemptRecord {
  const w = `attempts[${i}]`;
  const o = obj(v, w);
  const outcome = str(o.outcome, `${w}.outcome`);
  if (!OUTCOMES.has(outcome as Outcome)) throw new Invalid(`${w}.outcome: unexpected value`);
  const ret = o.retention === null || o.retention === undefined ? null : obj(o.retention, `${w}.retention`);
  const stage = num(o.stage, `${w}.stage`);
  if (stage !== 1 && stage !== 2 && stage !== 3) throw new Invalid(`${w}.stage`);
  return {
    attemptId: str(o.attemptId, `${w}.attemptId`),
    segmentId: str(o.segmentId, `${w}.segmentId`),
    appSession: str(o.appSession ?? '', `${w}.appSession`),
    slotIndex: num(o.slotIndex, `${w}.slotIndex`),
    slotRole: oneOf(o.slotRole, SLOT_ROLES, `${w}.slotRole`),
    reason: str(o.reason, `${w}.reason`) as AttemptRecord['reason'],
    itemId: str(o.itemId, `${w}.itemId`),
    itemVersion: num(o.itemVersion, `${w}.itemVersion`),
    contentVersion: str(o.contentVersion, `${w}.contentVersion`),
    turn: numOrNull(o.turn, `${w}.turn`),
    skill: str(o.skill, `${w}.skill`) as AttemptRecord['skill'],
    unit: unitId(o.unit, `${w}.unit`),
    sub: str(o.sub, `${w}.sub`),
    ctx: str(o.ctx, `${w}.ctx`),
    fam: str(o.fam, `${w}.fam`),
    type: oneOf(o.type, TASK_TYPES, `${w}.type`),
    role: oneOf(o.role, ROLES, `${w}.role`),
    stage: stage as 1 | 2 | 3,
    kind: oneOf(o.kind, ['main', 'repair'] as const, `${w}.kind`),
    attemptNo: num(o.attemptNo, `${w}.attemptNo`),
    firstAttempt: bool(o.firstAttempt, `${w}.firstAttempt`),
    firstEver: bool(o.firstEver, `${w}.firstEver`),
    familiar: bool(o.familiar ?? false, `${w}.familiar`),
    shownAt: num(o.shownAt, `${w}.shownAt`),
    submittedAt: num(o.submittedAt, `${w}.submittedAt`),
    answer: strList(o.answer, `${w}.answer`),
    answerText: str(o.answerText, `${w}.answerText`),
    supportBeforeSubmit: arr(o.supportBeforeSubmit, `${w}.supportBeforeSubmit`).map((x) => oneOf(x, SUPPORT, `${w}.support`)),
    feedbackShown: bool(o.feedbackShown, `${w}.feedbackShown`),
    outcome: outcome as Outcome,
    errorType: strOrNull(o.errorType, `${w}.errorType`),
    evalSource: str(o.evalSource, `${w}.evalSource`),
    hebrewPrompt: bool(o.hebrewPrompt, `${w}.hebrewPrompt`),
    assisted: bool(o.assisted, `${w}.assisted`),
    retention: ret
      ? {
          eligible: bool(ret.eligible, `${w}.retention.eligible`),
          why: str(ret.why, `${w}.retention.why`),
          hoursSinceTeach: numOrNull(ret.hoursSinceTeach, `${w}.retention.hours`),
          stepBefore: num(ret.stepBefore, `${w}.retention.stepBefore`),
          stepAfter: num(ret.stepAfter, `${w}.retention.stepAfter`),
        }
      : null,
    excluded: bool(o.excluded ?? false, `${w}.excluded`),
    reportReason:
      o.reportReason === null || o.reportReason === undefined
        ? null
        : oneOf(o.reportReason, ['more_than_one', 'unclear', 'seems_wrong', 'other'] as const, `${w}.reportReason`),
  };
}

function parseExposure(v: unknown, i: number): Exposure {
  const w = `exposures[${i}]`;
  const o = obj(v, w);
  return {
    itemId: str(o.itemId, `${w}.itemId`),
    firstAt: num(o.firstAt, `${w}.firstAt`),
    lastAt: num(o.lastAt, `${w}.lastAt`),
    count: num(o.count, `${w}.count`),
    segments: strList(o.segments ?? [], `${w}.segments`),
  };
}

function parseSummary(v: unknown, i: number): SegmentSummary {
  const w = `segments[${i}]`;
  const o = obj(v, w);
  const unitList = (x: unknown, where: string) =>
    arr(x ?? [], where).map((e, k) => {
      const eo = obj(e, `${where}[${k}]`);
      return { eo, unit: unitId(eo.unit, `${where}[${k}].unit`) };
    });
  return {
    segmentId: str(o.segmentId, `${w}.segmentId`),
    kind: oneOf(o.kind, ['calibration', 'first', 'regular'] as const, `${w}.kind`),
    size: oneOf(o.size, ['short', 'regular', 'deep'] as const, `${w}.size`),
    focusUnit: o.focusUnit === null || o.focusUnit === undefined ? null : unitId(o.focusUnit, `${w}.focusUnit`),
    startedAt: num(o.startedAt, `${w}.startedAt`),
    endedAt: num(o.endedAt, `${w}.endedAt`),
    completed: bool(o.completed, `${w}.completed`),
    endedEarlyReason:
      o.endedEarlyReason === null || o.endedEarlyReason === undefined
        ? null
        : oneOf(o.endedEarlyReason, ['stopped', 'content_exhausted'] as const, `${w}.endedEarlyReason`),
    tasksDone: num(o.tasksDone, `${w}.tasksDone`),
    tasksPlanned: num(o.tasksPlanned, `${w}.tasksPlanned`),
    practiced: unitList(o.practiced, `${w}.practiced`).map(({ eo, unit }) => ({ unit, count: num(eo.count, 'count') })),
    firstTry: unitList(o.firstTry, `${w}.firstTry`).map(({ eo, unit }) => ({
      unit,
      ok: num(eo.ok, 'ok'),
      total: num(eo.total, 'total'),
      example: strOrNull(eo.example, 'example'),
    })),
    toCheck: unitList(o.toCheck, `${w}.toCheck`).map(({ eo, unit }) => ({
      unit,
      why: oneOf(eo.why, ['errors', 'scheduled'] as const, 'why'),
      dueAt: numOrNull(eo.dueAt, 'dueAt'),
    })),
    difficulty:
      o.difficulty === null || o.difficulty === undefined
        ? null
        : oneOf(o.difficulty, ['too_easy', 'fits', 'too_hard'] as const, `${w}.difficulty`),
    askDifficulty: Boolean(o.askDifficulty),
  };
}

function parseReport(v: unknown, i: number): ReportRecord {
  const w = `reports[${i}]`;
  const o = obj(v, w);
  return {
    reportId: str(o.reportId, `${w}.reportId`),
    at: num(o.at, `${w}.at`),
    itemId: str(o.itemId, `${w}.itemId`),
    itemVersion: num(o.itemVersion, `${w}.itemVersion`),
    turn: numOrNull(o.turn, `${w}.turn`),
    reason: oneOf(o.reason, ['more_than_one', 'unclear', 'seems_wrong', 'other'] as const, `${w}.reason`),
    attemptIds: strList(o.attemptIds ?? [], `${w}.attemptIds`),
    answerText: strOrNull(o.answerText, `${w}.answerText`),
    status: oneOf(o.status, ['open', 'reviewed'] as const, `${w}.status`),
  };
}

function parseEvent(v: unknown, i: number): EventRecord {
  const w = `events[${i}]`;
  const o = obj(v, w);
  const data: EventRecord['data'] = {};
  for (const [k, val] of Object.entries(obj(o.data ?? {}, `${w}.data`))) {
    if (val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') data[k] = val;
  }
  return {
    id: str(o.id, `${w}.id`),
    at: num(o.at, `${w}.at`),
    type: oneOf(
      o.type,
      ['segment_started', 'segment_completed', 'segment_paused', 'segment_ended_early', 'help_used', 'report', 'save_failed', 'difficulty'] as const,
      `${w}.type`,
    ),
    data,
  };
}

/** Rebuild an imported active segment against the current content; drop it if anything no longer matches. */
function parseActive(v: unknown, items: ReadonlyMap<string, Item>): ActiveSegment | null {
  if (v === null || v === undefined) return null;
  try {
    const o = obj(v, 'active') as unknown as ActiveSegment;
    if (!Array.isArray(o.slots)) return null;
    for (const s of o.slots) {
      if (s.itemId && !items.has(s.itemId)) return null;
    }
    if (o.current) {
      const item = items.get(o.current.item?.id);
      if (!item || item.v !== o.current.item.v) return null;
      return { ...o, current: { ...o.current, item } };
    }
    return o;
  } catch {
    return null;
  }
}

export interface BackupPreview {
  attempts: number;
  segments: number;
  firstAt: number | null;
  lastAt: number | null;
  exportedAt: string;
  unitsStarted: number;
}

export type ParseResult =
  | { ok: true; snapshot: Snapshot; preview: BackupPreview }
  | { ok: false; error: string };

export function parseBackup(text: string, items: ReadonlyMap<string, Item>): ParseResult {
  if (text.length > CONFIG.maxBackupBytes) return { ok: false, error: 'הקובץ גדול מדי לגיבוי של האפליקציה.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'זה לא קובץ גיבוי תקין (לא ניתן לקרוא אותו כ-JSON).' };
  }
  try {
    const root = obj(raw, 'file');
    if (root.app !== 'sentence-lab') return { ok: false, error: 'הקובץ לא נוצר באפליקציה הזאת.' };
    const version = num(root.schemaVersion, 'schemaVersion');
    if (version > SCHEMA_VERSION) {
      return { ok: false, error: 'הקובץ נוצר בגרסה חדשה יותר של האפליקציה. עדכן את האפליקציה ונסה שוב.' };
    }
    const data = migrate(obj(root.data, 'data'), version);
    const units = defaultUnits();
    for (const [i, u] of arr(data.units, 'units').entries()) {
      const parsed = parseUnit(u, i);
      units[parsed.unit] = parsed;
    }
    const exposures: Snapshot['exposures'] = {};
    for (const [i, e] of arr(data.exposures, 'exposures').entries()) {
      const parsed = parseExposure(e, i);
      exposures[parsed.itemId] = parsed;
    }
    const attempts = arr(data.attempts, 'attempts').map(parseAttempt);
    const ids = new Set<string>();
    for (const a of attempts) {
      if (ids.has(a.attemptId)) throw new Invalid('attempts: duplicate id');
      ids.add(a.attemptId);
    }
    const snapshot: Snapshot = {
      profile: parseProfile(data.profile),
      settings: parseSettings(data.settings),
      units,
      attempts,
      exposures,
      active: parseActive(data.active, items),
      segments: arr(data.segments, 'segments').map(parseSummary),
      reports: arr(data.reports ?? [], 'reports').map(parseReport),
      events: arr(data.events ?? [], 'events').map(parseEvent),
    };
    const times = attempts.map((a) => a.submittedAt);
    return {
      ok: true,
      snapshot,
      preview: {
        attempts: attempts.length,
        segments: snapshot.segments.length,
        firstAt: times.length ? Math.min(...times) : null,
        lastAt: times.length ? Math.max(...times) : null,
        exportedAt: str(root.exportedAt, 'exportedAt'),
        unitsStarted: new Set(attempts.map((a) => a.unit)).size,
      },
    };
  } catch (e) {
    const msg = e instanceof Invalid ? e.message : 'unknown';
    return { ok: false, error: `הקובץ פגום או חלקי (${msg}). הנתונים הקיימים לא שונו.` };
  }
}

/** Schema migrations. Each step upgrades one version and never drops history. */
export function migrate(data: Obj, fromVersion: number): Obj {
  let d = data;
  let v = fromVersion;
  while (v < SCHEMA_VERSION) {
    // (no migrations yet: version 1 is the first schema)
    v += 1;
  }
  return d;
}
