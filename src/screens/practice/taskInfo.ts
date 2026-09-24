import { examplesFor, LESSONS } from '../../content';
import type { DialogueItem, Example, Item, Lesson, PartnerLine, UnitId } from '../../content/schema';
import { displaySentence } from '../../engine/evaluate';
import { turnUnit } from '../../engine/select';
import type { ActiveSegment, CurrentTask } from '../../engine/types';

export interface TaskInfo {
  item: Item;
  unit: UnitId;
  instr: string;
  goal: string;
  hint: string;
  explain: string;
  deep: string | undefined;
  diff: string | undefined;
  target: string | undefined;
  lesson: Lesson | undefined;
  examples: Example[];
  translation: string | null;
  /** for dialogues: what was said before, and what the partner says now */
  transcript: { who: 'partner' | 'me'; en: string; he?: string }[];
  partnerNow: PartnerLine | null;
  partnerName: string | null;
  closing: PartnerLine | null;
  isLastTurn: boolean;
}

function partnerFor(item: DialogueItem, turn: number, prevAcceptIndex: number | null): PartnerLine | null {
  const t = item.turns[turn];
  if (!t) return null;
  if (turn > 0 && prevAcceptIndex !== null && t.variants) {
    const v = t.variants.find((x) => x.ifPrev.includes(prevAcceptIndex));
    if (v) return v.line;
  }
  return t.partner;
}

export function taskInfo(seg: ActiveSegment, task: CurrentTask): TaskInfo {
  const item = task.item;
  const unit = turnUnit(item, task.turn);
  const lesson = LESSONS.get(unit);
  const base = {
    item,
    unit,
    lesson,
    examples: examplesFor(unit),
    deep: item.deep,
    diff: item.diff,
  };
  if (item.type === 'dialogue') {
    const turn = task.turn ?? 0;
    const t = item.turns[turn];
    const transcript: TaskInfo['transcript'] = [];
    for (let k = 0; k < turn; k++) {
      const prevTurn = item.turns[k];
      if (!prevTurn) continue;
      const p = partnerFor(item, k, null);
      if (p) transcript.push({ who: 'partner', en: p.en, he: p.he });
      const idx = k === turn - 1 ? (seg.dialogue?.prevAcceptIndex ?? 0) : 0;
      const acc = prevTurn.build.accept[idx] ?? prevTurn.build.accept[0];
      if (acc) transcript.push({ who: 'me', en: displaySentence(acc.a, prevTurn.build.end, prevTurn.build.lead) });
    }
    const partnerNow = partnerFor(item, turn, seg.dialogue?.prevAcceptIndex ?? null);
    return {
      ...base,
      instr: t?.instr ?? item.instr,
      goal: t?.goal ?? item.goal,
      hint: t?.hint ?? item.hint,
      explain: t?.explain ?? item.explain,
      target: t?.target,
      translation: partnerNow?.he ?? null,
      transcript,
      partnerNow,
      partnerName: item.partnerName,
      closing: item.closing ?? null,
      isLastTurn: turn >= item.turns.length - 1,
    };
  }
  return {
    ...base,
    instr: item.instr,
    goal: item.goal,
    hint: item.hint,
    explain: item.explain,
    target: item.target,
    translation: item.sitEn ? (item.trHe ?? null) : null,
    transcript: [],
    partnerNow: null,
    partnerName: null,
    closing: null,
    isLastTurn: true,
  };
}
