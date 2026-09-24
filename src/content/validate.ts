import {
  CONTEXT_FAMILIES,
  type BuildSpec,
  type DialogueItem,
  type DiscriminateItem,
  type Item,
  type SkillPack,
  type Token,
  type UnitId,
} from './schema';
import { evaluateBuild, phraseIndex, ruleMatches, toWords } from '../engine/evaluate';

export interface Issue {
  level: 'error' | 'warn';
  where: string;
  msg: string;
}

/** Can `words` be built by placing some of `tokens` (each at most once) in order? */
export function findBuild(words: readonly string[], tokens: readonly Token[]): Token[] | null {
  const tw = tokens.map((t) => toWords(t.t));
  const used = new Array<boolean>(tokens.length).fill(false);
  const path: Token[] = [];
  const dfs = (i: number): boolean => {
    if (i === words.length) return true;
    const triedText = new Set<string>();
    for (let k = 0; k < tokens.length; k++) {
      if (used[k]) continue;
      const w = tw[k] as string[];
      const text = w.join(' ');
      if (w.length === 0 || triedText.has(text)) continue;
      if (i + w.length > words.length) continue;
      if (!w.every((x, j) => words[i + j] === x)) continue;
      triedText.add(text);
      used[k] = true;
      path.push(tokens[k] as Token);
      if (dfs(i + w.length)) return true;
      path.pop();
      used[k] = false;
    }
    return false;
  };
  return dfs(0) ? [...path] : null;
}

const ENGLISH_RE = /^[a-z0-9' -]+$/;
const PUNCT_RE = /[.,!?;:"]/;

function sentenceCount(s: string): number {
  return s.split(/[.!?](?:\s|$)/).filter((x) => x.trim().length > 0).length;
}

function checkTokens(where: string, tokens: readonly Token[], issues: Issue[]): void {
  const ids = new Set<string>();
  for (const t of tokens) {
    if (ids.has(t.id)) issues.push({ level: 'error', where, msg: `duplicate token id "${t.id}"` });
    ids.add(t.id);
    if (!t.t.trim()) issues.push({ level: 'error', where, msg: `empty token "${t.id}"` });
    if (PUNCT_RE.test(t.t)) issues.push({ level: 'error', where, msg: `token "${t.t}" contains punctuation` });
    if (t.why && !t.err) issues.push({ level: 'error', where, msg: `token "${t.t}" has why but no err` });
  }
  const byText = new Map<string, Token[]>();
  for (const t of tokens) {
    const k = toWords(t.t).join(' ');
    byText.set(k, [...(byText.get(k) ?? []), t]);
  }
  for (const [k, list] of byText) {
    if (list.length > 1 && list.some((t) => t.why) && list.some((t) => !t.why)) {
      issues.push({ level: 'error', where, msg: `tokens with the same text "${k}" disagree on being a distractor` });
    }
  }
}

export function validateBuildSpec(
  where: string,
  spec: BuildSpec,
  allTokens: readonly Token[],
  issues: Issue[],
  opts: { target?: string; minTokens?: number; maxTokens?: number } = {},
): void {
  checkTokens(where, allTokens, issues);
  if (spec.accept.length === 0) issues.push({ level: 'error', where, msg: 'no accepted answers' });
  if (!spec.accept.some((a) => a.o === 'correct_target')) {
    issues.push({ level: 'error', where, msg: 'needs at least one correct_target answer' });
  }
  const seen = new Set<string>();
  for (const a of spec.accept) {
    const ws = toWords(a.a);
    const key = ws.join(' ');
    if (seen.has(key)) issues.push({ level: 'error', where, msg: `duplicate accepted answer "${a.a}"` });
    seen.add(key);
    if (/[.!?;:"]/.test(a.a)) {
      issues.push({ level: 'error', where, msg: `accepted answer has punctuation (end punctuation is automatic; commas are allowed): "${a.a}"` });
    }
    if (!ws.every((w) => ENGLISH_RE.test(w))) {
      issues.push({ level: 'error', where, msg: `accepted answer has unexpected characters: "${a.a}"` });
    }
    const first = a.a.trim().charAt(0);
    if (!spec.lead && first && first !== first.toUpperCase()) {
      issues.push({ level: 'warn', where, msg: `accepted answer should start with a capital letter: "${a.a}"` });
    }
    if (!findBuild(ws, allTokens)) {
      issues.push({ level: 'error', where, msg: `accepted answer cannot be built from the tokens: "${a.a}"` });
    }
    for (const r of spec.rules ?? []) {
      if (ruleMatches(ws, r)) {
        issues.push({ level: 'error', where, msg: `rule (${r.err}) matches accepted answer "${a.a}"` });
      }
    }
    if (a.o === 'target_not_used' && !opts.target) {
      issues.push({ level: 'error', where, msg: `target_not_used answer "${a.a}" requires the item to state a target` });
    }
    if (a.o !== 'correct_target' && !a.note) {
      issues.push({ level: 'warn', where, msg: `answer "${a.a}" (${a.o}) has no note explaining it` });
    }
  }
  for (const w of spec.wrong ?? []) {
    const ws = toWords(w.a);
    if (seen.has(ws.join(' '))) {
      issues.push({ level: 'error', where, msg: `known wrong answer is also accepted: "${w.a}"` });
    }
    if (!findBuild(ws, allTokens)) {
      issues.push({ level: 'warn', where, msg: `known wrong answer cannot be built from the tokens: "${w.a}"` });
    }
    if (!w.fb.trim()) issues.push({ level: 'error', where, msg: `known wrong answer without feedback: "${w.a}"` });
  }
  for (const r of spec.rules ?? []) {
    if (!r.has && !r.lacks && !r.order && r.starts === undefined && r.ends === undefined) {
      issues.push({ level: 'error', where, msg: `rule ${r.err} has no condition` });
    }
    for (const p of [...(r.has ?? []), ...(r.order ?? [])]) {
      if (!allTokens.length) break;
      const pw = toWords(p);
      const text = allTokens.map((t) => toWords(t.t).join(' ')).join(' | ');
      const possible = pw.every((w) => text.split(/[ |]+/).includes(w));
      if (!possible) {
        issues.push({ level: 'warn', where, msg: `rule ${r.err} refers to "${p}" which no token provides` });
      }
    }
  }
  const acceptedTexts = spec.accept.map((a) => toWords(a.a));
  for (const t of allTokens) {
    const inSome = acceptedTexts.some((ws) => phraseIndex(ws, t.t) !== -1);
    if (!inSome && !t.why) {
      issues.push({ level: 'error', where, msg: `token "${t.t}" is in no accepted answer, so it needs "why" + "err"` });
    }
  }
  const n = allTokens.length;
  if (opts.minTokens !== undefined && n < opts.minTokens) {
    issues.push({ level: 'warn', where, msg: `only ${n} tokens (expected ≥ ${opts.minTokens})` });
  }
  if (opts.maxTokens !== undefined && n > opts.maxTokens) {
    issues.push({ level: 'warn', where, msg: `${n} tokens (expected ≤ ${opts.maxTokens})` });
  }
}

function validateCommon(item: Item, issues: Issue[]): void {
  const where = item.id;
  if (!item.id || !/^[A-Z0-9][A-Za-z0-9.-]+$/.test(item.id)) issues.push({ level: 'error', where, msg: 'bad id' });
  if (!(item.ctx in CONTEXT_FAMILIES)) issues.push({ level: 'error', where, msg: `unknown ctx "${item.ctx}"` });
  if (!item.fam) issues.push({ level: 'error', where, msg: 'missing fam' });
  if (!item.goal.trim() || !item.instr.trim()) issues.push({ level: 'error', where, msg: 'missing goal/instr' });
  if (!item.hint.trim()) issues.push({ level: 'error', where, msg: 'missing hint' });
  if (!item.explain.trim()) issues.push({ level: 'error', where, msg: 'missing explain' });
  if (sentenceCount(item.explain) > 2 || item.explain.length > 260) {
    issues.push({ level: 'warn', where, msg: 'explain should be at most 2 short sentences (use deep for more)' });
  }
  if (item.sitEn && !item.trHe) issues.push({ level: 'error', where, msg: 'sitEn requires trHe' });
  if (item.stage === 1 && !item.promptHe && !item.scaffold && item.type !== 'correct' && item.type !== 'discriminate') {
    issues.push({ level: 'warn', where, msg: 'stage 1 item without promptHe or scaffold' });
  }
  if (item.scaffold && item.stage !== 1) {
    issues.push({ level: 'warn', where, msg: 'scaffold is meant for stage 1 only' });
  }
  if (item.role === 'check' && item.scaffold) {
    issues.push({ level: 'error', where, msg: 'check items must not show a scaffold' });
  }
  const unitSkill = item.unit.split('.')[0];
  if (unitSkill !== item.skill) issues.push({ level: 'error', where, msg: `unit ${item.unit} does not belong to ${item.skill}` });
}

function validateDiscriminate(item: DiscriminateItem, issues: Issue[]): void {
  const where = item.id;
  if (item.options.length < 2) issues.push({ level: 'error', where, msg: 'needs ≥ 2 options' });
  const fits = item.options.filter((o) => o.v === 'fits').length;
  if (fits === 0) issues.push({ level: 'error', where, msg: 'no option fits' });
  if (fits > 1 && !item.multi) issues.push({ level: 'error', where, msg: 'more than one option fits: set multi: true' });
  const ids = new Set<string>();
  for (const o of item.options) {
    if (ids.has(o.id)) issues.push({ level: 'error', where, msg: `duplicate option id ${o.id}` });
    ids.add(o.id);
    if (!o.why.trim()) issues.push({ level: 'error', where, msg: `option ${o.id} has no why` });
    if (!/[.?!]$/.test(o.en.trim())) issues.push({ level: 'warn', where, msg: `option ${o.id} should end with punctuation` });
  }
  const lens = item.options.map((o) => o.en.length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  if (max > min * 1.9 && max - min > 18) {
    issues.push({ level: 'warn', where, msg: 'option lengths differ a lot (length can give the answer away)' });
  }
  if (!item.sitHe && !item.sitEn && !item.promptHe) {
    issues.push({ level: 'error', where, msg: 'discrimination needs a situation (sitHe / sitEn / promptHe)' });
  }
}

function validateDialogue(item: DialogueItem, issues: Issue[]): void {
  if (item.turns.length < 1 || item.turns.length > 3) {
    issues.push({ level: 'error', where: item.id, msg: 'dialogue needs 1–3 turns' });
  }
  item.turns.forEach((turn, i) => {
    const where = `${item.id}#turn${i + 1}`;
    if (!turn.partner.en.trim() || !turn.partner.he.trim()) {
      issues.push({ level: 'error', where, msg: 'partner line needs en + he' });
    }
    if (!turn.hint.trim() || !turn.explain.trim() || !turn.instr.trim()) {
      issues.push({ level: 'error', where, msg: 'turn needs instr, hint and explain' });
    }
    validateBuildSpec(where, turn.build, turn.build.tokens, issues, {
      ...(turn.target ? { target: turn.target } : {}),
      minTokens: 4,
      maxTokens: 14,
    });
    if (turn.variants) {
      const prev = item.turns[i - 1];
      if (!prev) {
        issues.push({ level: 'error', where, msg: 'first turn cannot have variants' });
      } else {
        for (const v of turn.variants) {
          for (const idx of v.ifPrev) {
            if (!prev.build.accept[idx]) issues.push({ level: 'error', where, msg: `variant refers to missing answer #${idx}` });
          }
        }
      }
    }
  });
}

export function validateItem(item: Item, issues: Issue[]): void {
  validateCommon(item, issues);
  switch (item.type) {
    case 'assemble':
      if (!item.promptHe && !item.sitHe && !item.sitEn) {
        issues.push({ level: 'error', where: item.id, msg: 'assemble needs promptHe, sitHe or sitEn' });
      }
      validateBuildSpec(item.id, item, item.tokens, issues, {
        ...(item.target ? { target: item.target } : {}),
        minTokens: 5,
        maxTokens: 13,
      });
      break;
    case 'correct':
    case 'transform': {
      const all = [...item.source, ...item.tokens];
      validateBuildSpec(item.id, item, all, issues, {
        ...(item.target ? { target: item.target } : {}),
      });
      const asIs = evaluateBuild(item, item.source);
      if (item.type === 'transform' && (asIs.outcome === 'correct_target' || asIs.outcome === 'valid_alternative')) {
        issues.push({ level: 'error', where: item.id, msg: 'transform: the unchanged source must not be accepted' });
      }
      if (asIs.outcome === 'unverified') {
        issues.push({
          level: 'error',
          where: item.id,
          msg: `the unchanged source ("no correction needed") is not classified — add it to accept or wrong`,
        });
      }
      break;
    }
    case 'discriminate':
      validateDiscriminate(item, issues);
      break;
    case 'dialogue':
      validateDialogue(item, issues);
      break;
  }
}

export interface PackStats {
  items: number;
  byType: Record<string, number>;
  byRole: Record<string, number>;
  byStage: Record<string, number>;
  contexts: string[];
  productionShare: number;
}

export function packStats(items: readonly Item[]): PackStats {
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const ctx = new Set<string>();
  for (const it of items) {
    byType[it.type] = (byType[it.type] ?? 0) + 1;
    byRole[it.role] = (byRole[it.role] ?? 0) + 1;
    byStage[String(it.stage)] = (byStage[String(it.stage)] ?? 0) + 1;
    ctx.add(it.ctx);
  }
  const production = items.filter((i) => i.type !== 'discriminate').length;
  return {
    items: items.length,
    byType,
    byRole,
    byStage,
    contexts: [...ctx],
    productionShare: items.length ? production / items.length : 0,
  };
}

export function validatePack(pack: SkillPack, units: readonly UnitId[]): Issue[] {
  const issues: Issue[] = [];
  const where = pack.skill;
  const ids = new Set<string>();
  for (const item of pack.items) {
    if (ids.has(item.id)) issues.push({ level: 'error', where: item.id, msg: 'duplicate item id' });
    ids.add(item.id);
    if (item.skill !== pack.skill) issues.push({ level: 'error', where: item.id, msg: `item skill ${item.skill} in pack ${pack.skill}` });
    validateItem(item, issues);
  }
  const core = pack.items.filter((i) => i.role !== 'calibration');
  const stats = packStats(core);
  const practice = core.filter((i) => i.role === 'practice').length;
  const checks = core.filter((i) => i.role === 'check').length;
  if (practice < 8) issues.push({ level: 'error', where, msg: `needs ≥ 8 practice items (has ${practice})` });
  if (checks < 2) issues.push({ level: 'error', where, msg: `needs ≥ 2 reserved check items (has ${checks})` });
  if (stats.contexts.length < 3) issues.push({ level: 'error', where, msg: 'needs ≥ 3 context families' });
  if (Object.keys(stats.byType).length < 2) issues.push({ level: 'error', where, msg: 'needs more than one task type' });
  if (stats.productionShare < 0.6) {
    issues.push({ level: 'error', where, msg: `production share ${Math.round(stats.productionShare * 100)}% < 60%` });
  }
  for (const unit of units) {
    const uItems = core.filter((i) => i.unit === unit);
    if (!pack.lessons.some((l) => l.unit === unit)) issues.push({ level: 'error', where, msg: `no lesson for unit ${unit}` });
    const ex = pack.examples[unit] ?? [];
    if (ex.length < 2) issues.push({ level: 'error', where, msg: `unit ${unit} needs ≥ 2 extra examples` });
    if (uItems.length < 3) issues.push({ level: 'error', where, msg: `unit ${unit} has only ${uItems.length} items` });
    if (!uItems.some((i) => i.role === 'check')) issues.push({ level: 'error', where, msg: `unit ${unit} has no check item` });
    const stage1Ctx = new Set(uItems.filter((i) => i.stage === 1).map((i) => i.ctx));
    const checkCtx = uItems.filter((i) => i.role === 'check').map((i) => i.ctx);
    if (checkCtx.length && checkCtx.every((c) => stage1Ctx.has(c))) {
      issues.push({ level: 'warn', where, msg: `unit ${unit}: check items reuse the contexts of the supported items` });
    }
  }
  for (const l of pack.lessons) {
    if (sentenceCount(l.short) > 2) issues.push({ level: 'warn', where: `lesson ${l.unit}`, msg: 'short should be ≤ 2 sentences' });
    if (l.examples.length < 2) issues.push({ level: 'error', where: `lesson ${l.unit}`, msg: 'lesson needs ≥ 2 examples' });
  }
  return issues;
}
