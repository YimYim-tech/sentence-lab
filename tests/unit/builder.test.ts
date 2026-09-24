import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, ITEM_BY_ID } from '../../src/content';
import {
  answerTokens,
  bankTokens,
  buildView,
  caretPos,
  initialBuild,
  insertToken,
  isUnchanged,
  removeAt,
  resetBuild,
  setCaret,
  canUndo,
  undoBuild,
} from '../../src/engine/builder';
import { toWords } from '../../src/engine/evaluate';

const view = buildView(ITEM_BY_ID.get('S03-02')!, null)!;

describe('tap builder', () => {
  it('appends at the end by default', () => {
    let b = initialBuild(view, 7);
    b = insertToken(b, 't1');
    b = insertToken(b, 't2');
    expect(b.answer).toEqual(['t1', 't2']);
    expect(caretPos(b)).toBe(2);
  });

  it('after removing a word, the next word goes into the same place, then back to the end', () => {
    let b = initialBuild(view, 7);
    for (const id of ['t1', 't7', 't3']) b = insertToken(b, id);
    b = removeAt(b, 1); // remove the wrong "have"
    expect(caretPos(b)).toBe(1);
    b = insertToken(b, 't2'); // "has" takes its place
    expect(b.answer).toEqual(['t1', 't2', 't3']);
    expect(b.caret).toBeNull();
    b = insertToken(b, 't4');
    expect(b.answer).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('an explicit caret stays after each inserted word (sticky)', () => {
    let b = initialBuild(view, 7);
    for (const id of ['t1', 't4']) b = insertToken(b, id);
    b = setCaret(b, 1);
    b = insertToken(b, 't2');
    b = insertToken(b, 't3');
    expect(b.answer).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('never places the same token twice', () => {
    let b = initialBuild(view, 7);
    b = insertToken(b, 't1');
    b = insertToken(b, 't1');
    expect(b.answer).toEqual(['t1']);
  });

  it('correction items start from the given sentence and can be reset', () => {
    const v = buildView(ITEM_BY_ID.get('S03-01')!, null)!;
    let b = initialBuild(v, 3);
    expect(answerTokens(v, b).map((t) => t.t)).toEqual(['I', 'have', 'working', 'on the report', 'for two hours']);
    expect(isUnchanged(v, b)).toBe(true);
    b = setCaret(b, 2);
    b = insertToken(b, 't1');
    expect(isUnchanged(v, b)).toBe(false);
    expect(isUnchanged(v, resetBuild(v, b))).toBe(true);
  });

  it('supports step-by-step undo', () => {
    let b = initialBuild(view, 7);
    expect(canUndo(b)).toBe(false);
    b = insertToken(b, 't1');
    expect(canUndo(b)).toBe(true);
    expect(b.answer).toEqual(['t1']);
    b = insertToken(b, 't2');
    expect(b.answer).toEqual(['t1', 't2']);
    b = undoBuild(b);
    expect(b.answer).toEqual(['t1']);
    b = undoBuild(b);
    expect(b.answer).toEqual([]);
    expect(canUndo(b)).toBe(false);
  });

  it('keeps a stable bank order for the same seed', () => {
    const b = initialBuild(view, 1234);
    expect(bankTokens(view, b).map((t) => t.id)).toEqual(bankTokens(view, b).map((t) => t.id));
  });

  it('never shows the first accepted answer spelled out at the start of the bank', () => {
    for (const item of ALL_ITEMS) {
      const v = buildView(item, item.type === 'dialogue' ? 0 : null);
      if (!v || v.source.length) continue;
      const first = toWords(v.spec.accept[0]!.a).join(' ');
      for (let seed = 0; seed < 40; seed++) {
        const bank = bankTokens(v, initialBuild(v, seed));
        const joined = toWords(bank.map((t) => t.t).join(' ')).join(' ');
        expect(joined.startsWith(first)).toBe(false);
      }
    }
  });
});
