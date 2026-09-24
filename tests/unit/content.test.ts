import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, CALIBRATION, ITEM_BY_ID, LESSONS, PACKS } from '../../src/content';
import type { Item, SkillId } from '../../src/content/schema';
import { UNITS, UNITS_BY_SKILL } from '../../src/content/units';
import { findBuild, validateItem, validatePack, type Issue } from '../../src/content/validate';
import { buildView } from '../../src/engine/builder';
import { evaluateBuild, evaluateChoice, isFailure, toWords } from '../../src/engine/evaluate';
import { LESSONS_EN } from '../../src/content/lessonsEn';

function judge(itemId: string, sentence: string, turn: number | null = null) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) throw new Error(`missing item ${itemId}`);
  const view = buildView(item, turn)!;
  const path = findBuild(toWords(sentence), view.all);
  if (!path) throw new Error(`"${sentence}" cannot be built in ${itemId}`);
  return evaluateBuild(view.spec, path);
}

/** every build item in which this sentence is buildable */
function whereBuildable(sentence: string): { item: Item; turn: number | null }[] {
  const out: { item: Item; turn: number | null }[] = [];
  for (const item of ALL_ITEMS) {
    const turns = item.type === 'dialogue' ? item.turns.map((_, i) => i) : [null];
    for (const turn of turns) {
      const view = buildView(item, turn);
      if (view && findBuild(toWords(sentence), view.all)) out.push({ item, turn });
    }
  }
  return out;
}

describe('the content bank', () => {
  it('every pack passes validation with zero errors', () => {
    const errors: Issue[] = [];
    for (const s of Object.keys(PACKS) as SkillId[]) {
      errors.push(...validatePack(PACKS[s], UNITS_BY_SKILL[s] ?? []).filter((i) => i.level === 'error'));
    }
    const cal: Issue[] = [];
    for (const item of CALIBRATION) validateItem(item, cal);
    errors.push(...cal.filter((i) => i.level === 'error'));
    expect(errors.map((e) => `${e.where}: ${e.msg}`)).toEqual([]);
  });

  it('has at least 120 original items, ten per core skill (8 practice + 2 reserved checks)', () => {
    const core = ALL_ITEMS.filter((i) => i.role !== 'calibration');
    expect(core.length).toBeGreaterThanOrEqual(120);
    for (const s of Object.keys(PACKS) as SkillId[]) {
      const items = PACKS[s].items;
      expect(items.filter((i) => i.role === 'practice').length, s).toBeGreaterThanOrEqual(8);
      expect(items.filter((i) => i.role === 'check').length, s).toBeGreaterThanOrEqual(2);
    }
  });

  it('item ids are unique', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unit has a Hebrew lesson and an English explanation', () => {
    for (const u of UNITS) {
      expect(LESSONS.get(u.id), u.id).toBeDefined();
      expect(LESSONS_EN[u.id], u.id).toBeDefined();
    }
  });

  it('S11 covers each of its four units with practice and a check', () => {
    for (const unit of UNITS_BY_SKILL.S11) {
      const items = ALL_ITEMS.filter((i) => i.unit === unit);
      expect(items.filter((i) => i.role === 'practice').length, unit).toBeGreaterThanOrEqual(3);
      expect(items.some((i) => i.role === 'check'), unit).toBe(true);
    }
  });

  it('at least 60% of core tasks are build tasks, not whole-sentence choice', () => {
    const core = ALL_ITEMS.filter((i) => i.role !== 'calibration');
    const build = core.filter((i) => i.type !== 'discriminate').length;
    expect(build / core.length).toBeGreaterThanOrEqual(0.6);
  });

  it('check items never show a scaffold and are never stage 1', () => {
    for (const i of ALL_ITEMS.filter((x) => x.role === 'check')) {
      expect(i.scaffold, i.id).toBeUndefined();
      expect(i.stage, i.id).toBeGreaterThan(1);
    }
  });

  it('no token hands over a whole have-been-V-ing chain', () => {
    for (const item of ALL_ITEMS) {
      const turns = item.type === 'dialogue' ? item.turns.map((_, i) => i) : [null];
      for (const turn of turns) {
        const view = buildView(item, turn);
        if (!view) continue;
        for (const t of view.all) expect(/\b(have|has) been \w+ing\b/i.test(t.t), `${item.id}: "${t.t}"`).toBe(false);
      }
    }
  });
});

describe('linguistic cautions from the spec (§8)', () => {
  it('"I\'ve lived here" and "I\'ve been living here" are not punished where they fit', () => {
    for (const s of ['I have lived here since 2023', 'We have lived here since 2023']) {
      for (const { item, turn } of whereBuildable(s)) {
        const view = buildView(item, turn)!;
        const ev = evaluateBuild(view.spec, findBuild(toWords(s), view.all)!);
        expect(isFailure(ev.outcome), `${item.id}: ${s} → ${ev.outcome}`).toBe(false);
      }
    }
  });

  it('"I have worked here for three years" is not wrong just because the work continues', () => {
    expect(judge('S03-04', 'I have worked here for three years').outcome).toBe('valid_alternative');
  });

  it('a finished time takes the past simple, even with a link to now', () => {
    expect(judge('S06-01', 'I sent the email yesterday').outcome).toBe('correct_target');
    expect(isFailure(judge('S06-01', 'I have sent the email yesterday').outcome)).toBe(true);
  });

  it('"I still working" lacks the auxiliary; "I still work" is grammatical with another meaning', () => {
    expect(judge('S01-01', 'I still working on the report').outcome).toBe('form_error');
    expect(judge('S01-01', 'I still work on the report').outcome).toBe('meaning_mismatch');
  });

  it('the continuous can describe an activity that just stopped; stative know takes no -ing', () => {
    expect(judge('S03-08', 'It has been raining').outcome).toBe('correct_target');
    expect(judge('S03-08', 'It is raining').outcome).toBe('meaning_mismatch');
    const know = ITEM_BY_ID.get('S03-07');
    if (know?.type !== 'discriminate') throw new Error('S03-07');
    expect(evaluateChoice(know, ['a']).outcome).toBe('correct_target');
    expect(evaluateChoice(know, ['b']).outcome).toBe('form_error');
    expect(evaluateChoice(know, ['d']).outcome).toBe('meaning_mismatch');
  });

  it('"has been repaired" (passive) is explained as a different structure, not as the continuous', () => {
    const ev = judge('S03-05', 'The road has been repaired since May');
    expect(ev.err).toBe('passive_for_active');
  });

  it('indirect questions: no does inside, and "will take effect" is also fine', () => {
    expect(judge('CAL-4', 'Could you tell me when the new schedule takes effect').outcome).toBe('correct_target');
    expect(judge('CAL-4', 'Could you tell me when the new schedule will take effect').outcome).toBe('valid_alternative');
    expect(isFailure(judge('CAL-4', 'Could you tell me when does the new schedule take effect').outcome)).toBe(true);
  });

  it('every correct-type item classifies "no correction needed" explicitly', () => {
    for (const item of ALL_ITEMS) {
      if (item.type !== 'correct') continue;
      const ev = evaluateBuild(item, item.source);
      expect(ev.outcome, item.id).not.toBe('unverified');
    }
  });

  it('some correction items are already correct (learners must not assume every sentence is wrong)', () => {
    const correctItems = ALL_ITEMS.filter((i) => i.type === 'correct');
    const alreadyOk = correctItems.filter((i) => i.type === 'correct' && evaluateBuild(i, i.source).outcome === 'correct_target');
    expect(alreadyOk.length).toBeGreaterThanOrEqual(Math.floor(correctItems.length / 6));
  });

  it('no accepted answer of any item is rejected by another rule of the same item', () => {
    for (const item of ALL_ITEMS) {
      const turns = item.type === 'dialogue' ? item.turns.map((_, i) => i) : [null];
      for (const turn of turns) {
        const view = buildView(item, turn);
        if (!view) continue;
        for (const a of view.spec.accept) {
          const path = findBuild(toWords(a.a), view.all)!;
          expect(evaluateBuild(view.spec, path).outcome, `${item.id} ${a.a}`).toBe(a.o);
        }
      }
    }
  });
});
