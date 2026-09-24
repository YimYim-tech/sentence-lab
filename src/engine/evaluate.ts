import type {
  Accepted,
  BuildSpec,
  DiscriminateItem,
  Outcome,
  Rule,
  RuledOutcome,
  Token,
} from '../content/schema';

/** Lower-case, unify apostrophes, drop punctuation that is never judged, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[.,!?;:"“”()—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toWords(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

export const CONTRACTIONS: Readonly<Record<string, readonly string[]>> = {
  "i'm": ['i am'],
  "you're": ['you are'],
  "we're": ['we are'],
  "they're": ['they are'],
  "he's": ['he is', 'he has'],
  "she's": ['she is', 'she has'],
  "it's": ['it is', 'it has'],
  "who's": ['who is', 'who has'],
  "what's": ['what is', 'what has'],
  "where's": ['where is', 'where has'],
  "there's": ['there is', 'there has'],
  "i've": ['i have'],
  "you've": ['you have'],
  "we've": ['we have'],
  "they've": ['they have'],
  "i'd": ['i would', 'i had'],
  "you'd": ['you would', 'you had'],
  "he'd": ['he would', 'he had'],
  "she'd": ['she would', 'she had'],
  "we'd": ['we would', 'we had'],
  "they'd": ['they would', 'they had'],
  "i'll": ['i will'],
  "you'll": ['you will'],
  "he'll": ['he will'],
  "she'll": ['she will'],
  "we'll": ['we will'],
  "they'll": ['they will'],
  "can't": ['cannot', 'can not'],
  "don't": ['do not'],
  "doesn't": ['does not'],
  "didn't": ['did not'],
  "haven't": ['have not'],
  "hasn't": ['has not'],
  "hadn't": ['had not'],
  "aren't": ['are not'],
  "isn't": ['is not'],
  "wasn't": ['was not'],
  "weren't": ['were not'],
  "won't": ['will not'],
  "wouldn't": ['would not'],
  "couldn't": ['could not'],
  "shouldn't": ['should not'],
};

export function expandWordVariations(words: readonly string[]): string[] {
  let currents: string[][] = [[]];
  for (const w of words) {
    const expansions = CONTRACTIONS[w] ?? [w];
    const next: string[][] = [];
    for (const cur of currents) {
      for (const exp of expansions) {
        next.push([...cur, ...toWords(exp)]);
      }
    }
    currents = next.slice(0, 16);
  }
  return currents.map((c) => c.join(' '));
}

export function joinTokens(tokens: readonly Token[]): string {
  return tokens.map((t) => t.t).join(' ');
}

/** index of the first occurrence of `phrase` (as whole words) in `ws` at or after `from`, or -1 */
export function phraseIndex(ws: readonly string[], phrase: string, from = 0): number {
  const p = toWords(phrase);
  if (p.length === 0) return -1;
  outer: for (let i = from; i + p.length <= ws.length; i++) {
    for (let j = 0; j < p.length; j++) {
      if (ws[i + j] !== p[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function hasPhrase(ws: readonly string[], phrase: string): boolean {
  return phraseIndex(ws, phrase) !== -1;
}

export function ruleMatches(ws: readonly string[], rule: Rule): boolean {
  if (rule.has && !rule.has.every((p) => hasPhrase(ws, p))) return false;
  if (rule.lacks && rule.lacks.some((p) => hasPhrase(ws, p))) return false;
  if (rule.order) {
    let from = 0;
    for (const p of rule.order) {
      const idx = phraseIndex(ws, p, from);
      if (idx === -1) return false;
      from = idx + toWords(p).length;
    }
  }
  if (rule.starts !== undefined) {
    const p = toWords(rule.starts);
    if (p.length > ws.length || p.some((w, i) => ws[i] !== w)) return false;
  }
  if (rule.ends !== undefined) {
    const p = toWords(rule.ends);
    const off = ws.length - p.length;
    if (off < 0 || p.some((w, i) => ws[off + i] !== w)) return false;
  }
  return true;
}

/** word-level Levenshtein distance */
export function wordDistance(a: readonly string[], b: readonly string[]): number {
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

export interface Evaluation {
  outcome: Outcome;
  /** error type key (for form_error / meaning_mismatch / target_not_used from rules) */
  err?: string;
  /** Hebrew feedback specific to what went wrong */
  feedback?: string;
  /** Hebrew note attached to the accepted answer that matched */
  note?: string;
  source: 'accept' | 'wrong' | 'rule' | 'distractor' | 'incomplete' | 'none' | 'choice' | 'skip';
  /** index in the accept list, when an accepted answer matched */
  acceptIndex?: number;
  /** model sentence (display form, with punctuation) — the correct answer closest to the attempt */
  model: string;
  /** for choice items: option ids that fit */
  fitting?: string[];
  distractorId?: string;
}

export function isSuccess(o: Outcome): boolean {
  return o === 'correct_target' || o === 'valid_alternative';
}

export function isFailure(o: Outcome): boolean {
  return o === 'form_error' || o === 'meaning_mismatch';
}

export function displaySentence(a: string, end: string, lead?: string): string {
  const s = a.trim();
  if (!s) return s;
  if (lead) return `${lead.trim()} ${s}${end}`;
  return s.charAt(0).toUpperCase() + s.slice(1) + end;
}

/** The correct answer closest to the attempt: prefers correct_target, then valid_alternative. */
export function closestModel(spec: BuildSpec, ws: readonly string[]): { a: Accepted; index: number } {
  let best: { a: Accepted; index: number; score: number } | null = null;
  spec.accept.forEach((a, index) => {
    if (a.o === 'target_not_used') return;
    const d = wordDistance(ws, toWords(a.a)) + (a.o === 'correct_target' ? 0 : 0.5);
    if (!best || d < best.score) best = { a, index, score: d };
  });
  if (!best) {
    const first = spec.accept[0];
    if (!first) throw new Error('item has no accepted answers');
    return { a: first, index: 0 };
  }
  const b = best as { a: Accepted; index: number; score: number };
  return { a: b.a, index: b.index };
}

/**
 * Judge a built answer.
 * @param spec the item's build spec
 * @param used the tokens the learner placed, in order (source tokens included for correct/transform)
 */
export function evaluateBuild(spec: BuildSpec, used: readonly Token[]): Evaluation {
  const ws = toWords(joinTokens(used));
  const key = ws.join(' ');
  const model = closestModel(spec, ws);
  const modelText = displaySentence(model.a.a, spec.end, spec.lead);

  let acceptIndex = spec.accept.findIndex((a) => toWords(a.a).join(' ') === key);
  if (acceptIndex === -1) {
    const wsVars = expandWordVariations(ws);
    acceptIndex = spec.accept.findIndex((a) => {
      const aVars = expandWordVariations(toWords(a.a));
      return wsVars.some((v) => aVars.includes(v));
    });
  }
  if (acceptIndex !== -1) {
    const a = spec.accept[acceptIndex] as Accepted;
    const res: Evaluation = { outcome: a.o, source: 'accept', acceptIndex, model: modelText };
    if (a.note) res.note = a.note;
    if (a.o !== 'correct_target') {
      const target = spec.accept.find((x) => x.o === 'correct_target');
      if (target) res.model = displaySentence(target.a, spec.end, spec.lead);
    } else {
      res.model = displaySentence(a.a, spec.end, spec.lead);
    }
    return res;
  }

  let known = spec.wrong?.find((w) => toWords(w.a).join(' ') === key);
  if (!known && spec.wrong?.length) {
    const wsVars = expandWordVariations(ws);
    known = spec.wrong.find((w) => {
      const wVars = expandWordVariations(toWords(w.a));
      return wsVars.some((v) => wVars.includes(v));
    });
  }
  if (known) {
    return { outcome: known.as, err: known.err, feedback: known.fb, source: 'wrong', model: modelText };
  }

  // A proper prefix of a correct answer is unfinished, never wrong: it is checked before rules and
  // distractor reasons, which could otherwise fire on a correct but half-built sentence.
  const isPrefix = spec.accept.some((a) => {
    const aw = toWords(a.a);
    return ws.length > 0 && ws.length < aw.length && ws.every((w, i) => aw[i] === w);
  });
  if (isPrefix) {
    return {
      outcome: 'unverified',
      source: 'incomplete',
      feedback: 'נראה שהמשפט לא הושלם. זה לא נספר כטעות — הנה משפט מלא אפשרי.',
      model: modelText,
    };
  }

  for (const rule of spec.rules ?? []) {
    if (ruleMatches(ws, rule)) {
      return { outcome: rule.as, err: rule.err, feedback: rule.fb, source: 'rule', model: modelText };
    }
  }

  // several distractors: report a grammar error before a meaning-type one
  const distractors = used.filter((t) => t.why);
  const distractor = distractors.find((t) => (t.as ?? 'form_error') === 'form_error') ?? distractors[0];
  if (distractor && distractor.why) {
    const outcome: RuledOutcome = distractor.as ?? 'form_error';
    return {
      outcome,
      err: distractor.err ?? 'distractor',
      feedback: distractor.why,
      source: 'distractor',
      model: modelText,
      distractorId: distractor.id,
    };
  }

  return {
    outcome: 'unverified',
    source: 'none',
    feedback:
      'את התשובה הזאת אי אפשר לאמת אוטומטית: היא לא ברשימת התשובות שהתרגיל יודע לבדוק. זה לא נספר כטעות. השווה לתשובה אפשרית:',
    model: modelText,
  };
}

/**
 * Judge a sentence given as plain text — for example a speech-recognition transcript in a future
 * voice mode — with exactly the same accepted answers, known errors, rules and distractor reasons
 * as a tapped answer. Words that match a single-word distractor token keep that token's reason.
 */
export function evaluateText(spec: BuildSpec, text: string, allTokens: readonly Token[] = spec.tokens): Evaluation {
  const words = toWords(text);
  const tokens: Token[] = words.map((w, i) => {
    const d = allTokens.find((x) => x.why && toWords(x.t).length === 1 && toWords(x.t)[0] === w);
    return d ? { ...d, id: `w${i}` } : { id: `w${i}`, t: w };
  });
  return evaluateBuild(spec, tokens);
}

export function evaluateChoice(item: DiscriminateItem, selected: readonly string[]): Evaluation {
  const fitting = item.options.filter((o) => o.v === 'fits');
  const model = fitting.map((o) => o.en).join('  /  ');
  const sel = new Set(selected);
  const wrongPicked = item.options.filter((o) => sel.has(o.id) && o.v !== 'fits');
  const missed = fitting.filter((o) => !sel.has(o.id));
  const fittingIds = fitting.map((o) => o.id);
  if (wrongPicked.length === 0 && missed.length === 0) {
    return { outcome: 'correct_target', source: 'choice', model, fitting: fittingIds };
  }
  const firstWrong = wrongPicked[0];
  if (firstWrong) {
    return {
      outcome: firstWrong.v === 'ungrammatical' ? 'form_error' : 'meaning_mismatch',
      err: firstWrong.err ?? (firstWrong.v === 'ungrammatical' ? 'form' : 'meaning'),
      feedback: firstWrong.why,
      source: 'choice',
      model,
      fitting: fittingIds,
    };
  }
  const firstMissed = missed[0];
  return {
    outcome: 'meaning_mismatch',
    err: 'missed_valid_option',
    feedback: firstMissed ? `גם המשפט הזה מתאים: ${firstMissed.why}` : undefined,
    source: 'choice',
    model,
    fitting: fittingIds,
  };
}
