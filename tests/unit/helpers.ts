import { ALL_ITEMS, CONTENT_VERSION } from '../../src/content';
import type { BuildSpec, Item, Token } from '../../src/content/schema';
import { findBuild } from '../../src/content/validate';
import { buildView } from '../../src/engine/builder';
import { evaluateBuild, isFailure, toWords } from '../../src/engine/evaluate';
import { makeIndex } from '../../src/engine/select';
import * as S from '../../src/engine/session';
import { applyChange, emptySnapshot } from '../../src/engine/snapshot';
import type { Change, Snapshot } from '../../src/engine/types';

export const idx = makeIndex(ALL_ITEMS);
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** 2026-09-24 09:00 Asia/Jerusalem (06:00 UTC) */
export const T0 = Date.UTC(2026, 8, 24, 6, 0, 0);

export class Sim {
  snap: Snapshot;
  now: number;
  constructor(now = T0, snap?: Snapshot) {
    this.now = now;
    this.snap = snap ?? emptySnapshot(now);
  }
  env(): S.Env {
    return { idx, now: this.now, appSession: 'test', contentVersion: CONTENT_VERSION };
  }
  run(step: (s: Snapshot, e: S.Env) => Change): Change {
    const c = step(this.snap, this.env());
    this.snap = applyChange(this.snap, c);
    return c;
  }
  tick(ms = 20_000): void {
    this.now += ms;
  }
  get seg() {
    return this.snap.active;
  }
  get task() {
    return this.snap.active?.current ?? null;
  }
}

/** token ids that spell an accepted answer of the given outcome */
export function idsFor(spec: BuildSpec, all: readonly Token[], sentence: string): string[] | null {
  const path = findBuild(toWords(sentence), all);
  return path ? path.map((t) => t.id) : null;
}

export function correctIds(item: Item, turn: number | null): string[] {
  const view = buildView(item, turn);
  if (!view) throw new Error('not a build item');
  const target = view.spec.accept.find((a) => a.o === 'correct_target') ?? view.spec.accept[0];
  const ids = target ? idsFor(view.spec, view.all, target.a) : null;
  if (!ids) throw new Error(`cannot build answer for ${item.id}`);
  return ids;
}

/** an answer the item itself establishes as wrong (known wrong, or a distractor in place of a word) */
export function wrongIds(item: Item, turn: number | null): string[] | null {
  const view = buildView(item, turn);
  if (!view) return null;
  for (const w of view.spec.wrong ?? []) {
    if (w.as === 'target_not_used') continue;
    const ids = idsFor(view.spec, view.all, w.a);
    if (ids) return ids;
  }
  const good = correctIds(item, turn);
  const distractor = view.all.find((t) => t.why && !good.includes(t.id));
  if (!distractor) return null;
  const candidate = [...good.slice(0, -1), distractor.id];
  const tokens = candidate.map((id) => view.all.find((t) => t.id === id) as Token);
  return isFailure(evaluateBuild(view.spec, tokens).outcome) ? candidate : null;
}

export type Policy = 'correct' | 'wrong' | 'skip' | 'hint' | 'wrong-then-repair';

/** Answer the current task according to the policy and move on. Returns the main outcome. */
export function answer(sim: Sim, policy: Policy): string | null {
  const seg = sim.seg;
  if (seg?.phase === 'explain') {
    sim.run(S.continueFlow);
    return 'explain';
  }
  const task = sim.task;
  if (!seg || !task) return null;
  if (seg.phase !== 'task') throw new Error(`unexpected phase ${seg.phase}`);
  sim.tick();
  if (policy === 'skip') {
    sim.run(S.skipTask);
    return 'skipped';
  }
  if (policy === 'hint') sim.run((s, e) => S.openHelp(s, e, 'hint'));
  const item = task.item;
  if (item.type === 'discriminate') {
    const fitting = item.options.filter((o) => o.v === 'fits').map((o) => o.id);
    const wrong = item.options.find((o) => o.v !== 'fits')?.id;
    const choice = policy === 'wrong' || policy === 'wrong-then-repair' ? [wrong ?? fitting[0] ?? ''] : fitting;
    sim.run((s, e) => S.updateChoice(s, e, choice));
  } else {
    const bad = policy === 'wrong' || policy === 'wrong-then-repair' ? wrongIds(item, task.turn) : null;
    const ids = bad ?? correctIds(item, task.turn);
    const seed = task.build?.seed ?? 1;
    sim.run((s, e) => S.updateBuild(s, e, { answer: ids, caret: null, sticky: false, seed }));
  }
  sim.run(S.submit);
  const outcome = sim.task?.lastEval?.outcome ?? null;
  if (policy === 'wrong-then-repair' && sim.task && S.canRepair(sim.task)) {
    sim.run(S.startRepair);
    const ids = correctIds(item, sim.task.turn);
    sim.run((s, e) => S.updateBuild(s, e, { answer: ids, caret: null, sticky: false, seed: 1 }));
    sim.run(S.submit);
  }
  sim.tick();
  sim.run(S.continueFlow);
  return outcome;
}

/** Play the active segment to its summary. */
export function playSegment(sim: Sim, policy: (i: number) => Policy): string[] {
  const outcomes: string[] = [];
  let guard = 0;
  let i = 0;
  while (sim.seg && sim.seg.phase !== 'summary' && guard++ < 200) {
    const o = answer(sim, policy(i));
    if (o !== 'explain') i += 1;
    if (o) outcomes.push(o);
  }
  if (guard >= 200) throw new Error('segment did not finish');
  return outcomes;
}
