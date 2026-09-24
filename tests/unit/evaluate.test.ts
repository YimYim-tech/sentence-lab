import { describe, expect, it } from 'vitest';
import type { BuildSpec, DiscriminateItem, Token } from '../../src/content/schema';
import { ITEM_BY_ID } from '../../src/content';
import {
  displaySentence,
  evaluateBuild,
  evaluateChoice,
  evaluateText,
  normalizeText,
  phraseIndex,
  ruleMatches,
  toWords,
  wordDistance,
} from '../../src/engine/evaluate';
import { buildView } from '../../src/engine/builder';
import { findBuild } from '../../src/content/validate';

function tokensFor(itemId: string, sentence: string, turn: number | null = null): Token[] {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) throw new Error(itemId);
  const view = buildView(item, turn);
  if (!view) throw new Error('no view');
  const path = findBuild(toWords(sentence), view.all);
  if (!path) throw new Error(`cannot build "${sentence}" in ${itemId}`);
  return path;
}

function judge(itemId: string, sentence: string, turn: number | null = null) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) throw new Error(itemId);
  const view = buildView(item, turn);
  if (!view) throw new Error('no view');
  return evaluateBuild(view.spec, tokensFor(itemId, sentence, turn));
}

describe('normalisation and matching', () => {
  it('ignores case, punctuation and curly apostrophes', () => {
    expect(normalizeText("  I’ve  Been, WAITING!  ")).toBe("i've been waiting");
    expect(toWords('How long?')).toEqual(['how', 'long']);
  });

  it('finds whole-word phrases only', () => {
    const ws = toWords('I have been working here');
    expect(phraseIndex(ws, 'have been')).toBe(1);
    expect(phraseIndex(ws, 'been work')).toBe(-1);
  });

  it('evaluates rule conditions (has / lacks / order / starts / ends)', () => {
    const ws = toWords('how long you have been working');
    expect(ruleMatches(ws, { has: ['have working'], as: 'form_error', err: 'x', fb: '' })).toBe(false);
    expect(ruleMatches(ws, { order: ['you', 'have'], as: 'form_error', err: 'x', fb: '' })).toBe(true);
    expect(ruleMatches(ws, { has: ['working'], lacks: ['been'], as: 'form_error', err: 'x', fb: '' })).toBe(false);
    expect(ruleMatches(ws, { starts: 'how long', ends: 'working', as: 'form_error', err: 'x', fb: '' })).toBe(true);
  });

  it('measures word distance', () => {
    expect(wordDistance(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(wordDistance([], ['a'])).toBe(1);
  });

  it('displays sentences with automatic capital and punctuation, or after a lead', () => {
    expect(displaySentence('she has been waiting', '.')).toBe('She has been waiting.');
    expect(displaySentence("but I haven't", '.', 'I sent it,')).toBe("I sent it, but I haven't.");
  });
});

describe('judging built answers (first-segment items)', () => {
  it('accepts the target structure', () => {
    expect(judge('S03-01', 'I have been working on the report for two hours').outcome).toBe('correct_target');
  });

  it('marks the missing been as a specific form error', () => {
    const r = judge('S03-01', 'I have working on the report for two hours');
    expect(r.outcome).toBe('form_error');
    expect(r.err).toBe('missing_been');
    expect(r.model).toBe('I have been working on the report for two hours.');
  });

  it('treats present perfect simple as grammatical but not the requested structure', () => {
    const r = judge('S03-01', 'I have worked on the report for two hours');
    expect(r.outcome).toBe('target_not_used');
  });

  it('does not punish "I have worked here for three years" (valid alternative)', () => {
    expect(judge('S03-04', 'I have worked here for three years').outcome).toBe('valid_alternative');
    expect(judge('S03-04', 'I have been working here for three years').outcome).toBe('correct_target');
    expect(judge('S03-04', 'I am working here for three years').err).toBe('present_for_duration');
  });

  it('accepts both for and since when both fit the situation', () => {
    expect(judge('S05-01', 'We have been talking for two hours').outcome).toBe('correct_target');
    expect(judge('S05-01', 'We have been talking since nine').outcome).toBe('correct_target');
    expect(judge('S05-01', 'We have been talking for nine').err).toBe('for_point');
    expect(judge('S05-01', 'We have been talking since two hours').err).toBe('since_period');
  });

  it('separates "I still work on the report" (meaning) from "I still working" (form)', () => {
    expect(judge('S01-01', 'I still work on the report').outcome).toBe('meaning_mismatch');
    expect(judge('S01-01', 'I still working on the report').outcome).toBe('form_error');
    expect(judge('S01-01', 'I am still working on the report').outcome).toBe('correct_target');
  });

  it('finished time: past simple is required, present perfect with yesterday is an error', () => {
    expect(judge('S06-01', 'I sent the email yesterday').outcome).toBe('correct_target');
    expect(judge('S06-01', 'I have sent the email yesterday').err).toBe('perfect_with_finished_time');
  });

  it('accepts American "didn\'t … yet" as grammatical, without counting it as the target', () => {
    expect(judge('S06-02', "but I haven't received a reply yet").outcome).toBe('correct_target');
    expect(judge('S06-02', "but I didn't receive a reply yet").outcome).toBe('target_not_used');
  });

  it('indirect questions: no does inside; will take effect is also fine', () => {
    expect(judge('CAL-4', 'Could you tell me when the new schedule takes effect').outcome).toBe('correct_target');
    expect(judge('CAL-4', 'Could you tell me when the new schedule will take effect').outcome).toBe('valid_alternative');
    expect(judge('CAL-4', 'Could you tell me when does the new schedule take effect').err).toBe('inversion_in_indirect');
    expect(judge('CAL-4', 'When does the new schedule take effect').outcome).toBe('target_not_used');
  });

  it('reports a distractor with its own reason', () => {
    const r = judge('S03-02', 'She has been waiting since twenty minutes');
    expect(r.outcome).toBe('form_error');
    expect(r.err).toBe('since_period');
  });

  it('never calls an unknown sentence wrong', () => {
    const r = judge('S03-02', 'twenty minutes she has been waiting for');
    expect(r.outcome).toBe('unverified');
  });

  it('recognises an unfinished sentence as incomplete, not wrong', () => {
    const r = judge('S03-02', 'She has been waiting');
    expect(r.outcome).toBe('unverified');
    expect(r.source).toBe('incomplete');
  });

  it('judges dialogue turns with their own spec', () => {
    expect(judge('S03-D1', 'I have been working on it since eight', 1).outcome).toBe('correct_target');
    expect(judge('S03-D1', 'I have been working on it for eight', 1).err).toBe('for_point');
  });
});

describe('choice items', () => {
  const item: DiscriminateItem = {
    id: 'T-1',
    v: 1,
    skill: 'S09',
    unit: 'S09',
    sub: 'x',
    type: 'discriminate',
    role: 'practice',
    stage: 3,
    ctx: 'work.meeting',
    fam: 't',
    goal: 'g',
    instr: 'i',
    sitHe: 's',
    hint: 'h',
    explain: 'e',
    multi: true,
    options: [
      { id: 'a', en: 'A.', v: 'fits', why: 'a' },
      { id: 'b', en: 'B.', v: 'fits', why: 'b' },
      { id: 'c', en: 'C.', v: 'other_meaning', why: 'c', err: 'meaning' },
      { id: 'd', en: 'D.', v: 'ungrammatical', why: 'd', err: 'form' },
    ],
  };
  it('requires every fitting option in "choose all" items', () => {
    expect(evaluateChoice(item, ['a', 'b']).outcome).toBe('correct_target');
    expect(evaluateChoice(item, ['a']).err).toBe('missed_valid_option');
  });
  it('separates a meaning mismatch from a form error', () => {
    expect(evaluateChoice(item, ['a', 'b', 'c']).outcome).toBe('meaning_mismatch');
    expect(evaluateChoice(item, ['d']).outcome).toBe('form_error');
  });
});

describe('voice-ready: judging plain text with the same rules', () => {
  it('a spoken-style transcript is judged exactly like a tapped answer', () => {
    const item = ITEM_BY_ID.get('S03-02')!;
    const view = buildView(item, null)!;
    expect(evaluateText(view.spec, 'She has been waiting for twenty minutes.', view.all).outcome).toBe('correct_target');
    expect(evaluateText(view.spec, "She's been waiting for twenty minutes.", view.all).outcome).toBe('correct_target');
    expect(evaluateText(view.spec, 'she has waiting for twenty minutes', view.all).err).toBe('missing_been');
    expect(evaluateText(view.spec, 'She has been waiting since twenty minutes', view.all).err).toBe('since_period');
    expect(evaluateText(view.spec, 'She is waiting for twenty minutes', view.all).err).toBe('present_for_duration');
    expect(evaluateText(view.spec, "She's waiting for twenty minutes", view.all).err).toBe('present_for_duration');
  });
});

describe('a spec is judged by words, not by token boundaries', () => {
  it('matches regardless of how multi-word tokens are split', () => {
    const spec: BuildSpec = {
      tokens: [],
      accept: [{ a: 'I am on the report', o: 'correct_target' }],
      end: '.',
    };
    const split: Token[] = [
      { id: '1', t: 'I' },
      { id: '2', t: 'am on' },
      { id: '3', t: 'the report' },
    ];
    expect(evaluateBuild(spec, split).outcome).toBe('correct_target');
  });
});
