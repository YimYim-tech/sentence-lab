import type { BuildSpec, DialogueItem, Item, Token } from '../content/schema';
import { toWords } from './evaluate';
import { bankOrder, hashString } from './rng';
import type { BuildState } from './types';

export interface BuildView {
  spec: BuildSpec;
  /** tokens pre-filled in the answer line (correct / transform) */
  source: Token[];
  /** every token available in this task */
  all: Token[];
}

/** The build spec for a build item or a dialogue turn; null for choice items. */
export function buildView(item: Item, turn: number | null): BuildView | null {
  switch (item.type) {
    case 'assemble':
      return { spec: item, source: [], all: item.tokens };
    case 'correct':
    case 'transform':
      return { spec: item, source: item.source, all: [...item.source, ...item.tokens] };
    case 'dialogue': {
      const t = (item as DialogueItem).turns[turn ?? 0];
      if (!t) return null;
      return { spec: t.build, source: [], all: t.build.tokens };
    }
    default:
      return null;
  }
}

export function initialBuild(view: BuildView, seed: number): BuildState {
  return { answer: view.source.map((t) => t.id), caret: null, sticky: false, seed };
}

export function tokenById(view: BuildView, id: string): Token | undefined {
  return view.all.find((t) => t.id === id);
}

export function answerTokens(view: BuildView, build: BuildState): Token[] {
  return build.answer.map((id) => tokenById(view, id)).filter((t): t is Token => Boolean(t));
}

/** Tokens not in the answer line, in a stable shuffled order that never starts with an
 *  accepted answer spelled out in order. */
export function bankTokens(view: BuildView, build: BuildState): Token[] {
  const placed = new Set(build.answer);
  const free = view.all.filter((t) => !placed.has(t.id));
  const firstAccepted = view.spec.accept[0] ? toWords(view.spec.accept[0].a).join(' ') : '';
  let seed = build.seed;
  for (let i = 0; i < 6; i++) {
    const ordered = bankOrder(free, seed, (t) => t.id);
    const joined = toWords(ordered.map((t) => t.t).join(' ')).join(' ');
    if (!firstAccepted || !joined.startsWith(firstAccepted) || free.length < 3) return ordered;
    seed = hashString(`${seed}/${i}`);
  }
  return bankOrder(free, seed, (t) => t.id);
}

export function caretPos(build: BuildState): number {
  return build.caret === null ? build.answer.length : Math.min(build.caret, build.answer.length);
}

/** Tap on a bank token: insert it at the caret. */
export function insertToken(build: BuildState, tokenId: string): BuildState {
  if (build.answer.includes(tokenId)) return build;
  const pos = caretPos(build);
  const answer = [...build.answer.slice(0, pos), tokenId, ...build.answer.slice(pos)];
  const history = [...(build.history ?? []), build.answer];
  if (build.caret === null) return { ...build, answer, history };
  // after a removal the caret is one-shot (returns to the end); after an explicit gap tap it stays
  return build.sticky ? { ...build, answer, caret: pos + 1, history } : { ...build, answer, caret: null, history };
}

/** Tap on a placed token: send it back to the bank; the caret stays where it was (one-shot). */
export function removeAt(build: BuildState, index: number): BuildState {
  if (index < 0 || index >= build.answer.length) return build;
  const answer = build.answer.filter((_, i) => i !== index);
  const history = [...(build.history ?? []), build.answer];
  return { ...build, answer, caret: index >= answer.length ? null : index, sticky: false, history };
}

/** Undo the last change to the answer line. */
export function canUndo(build: BuildState): boolean {
  return Boolean(build.history && build.history.length > 0);
}

export function undoBuild(build: BuildState): BuildState {
  if (!build.history || build.history.length === 0) return build;
  const history = [...build.history];
  const prevAnswer = history.pop()!;
  return {
    ...build,
    answer: prevAnswer,
    caret: null,
    sticky: false,
    history,
  };
}

/** Tap on a gap in the answer line: move the insertion point there. */
export function setCaret(build: BuildState, pos: number): BuildState {
  const clamped = Math.max(0, Math.min(pos, build.answer.length));
  if (clamped === build.answer.length) return { ...build, caret: null, sticky: false };
  return { ...build, caret: clamped, sticky: true };
}

export function resetBuild(view: BuildView, build: BuildState): BuildState {
  const history = [...(build.history ?? []), build.answer];
  return { ...initialBuild(view, build.seed), history };
}

export function isUnchanged(view: BuildView, build: BuildState): boolean {
  return build.answer.length === view.source.length && build.answer.every((id, i) => view.source[i]?.id === id);
}
