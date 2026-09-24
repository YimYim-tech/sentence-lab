/**
 * Linguistic audit helper. For each build item it generates "near miss" sentences (one token
 * removed, replaced, inserted or two neighbours swapped) and lists every one the item would mark
 * as an ERROR (form_error / meaning_mismatch). A reviewer scans the list for sentences that are
 * actually correct and fitting — those are false negatives that must be fixed.
 *
 *   npx tsx scripts/audit-content.ts --skill S05 [--unverified]
 */
import { PACKS, CALIBRATION } from '../src/content/index';
import type { BuildSpec, Item, SkillId, Token } from '../src/content/schema';
import { findBuild } from '../src/content/validate';
import { buildView } from '../src/engine/builder';
import { evaluateBuild, isFailure, toWords } from '../src/engine/evaluate';

const args = process.argv.slice(2);
const skills: SkillId[] = [];
args.forEach((a, i) => {
  if (a === '--skill' && args[i + 1]) skills.push(args[i + 1] as SkillId);
});
const showUnverified = args.includes('--unverified');
const withInsertions = args.includes('--insertions');

function neighbours(path: Token[], all: readonly Token[]): Token[][] {
  const unused = all.filter((t) => !path.includes(t));
  const out: Token[][] = [];
  for (let i = 0; i < path.length; i++) out.push(path.filter((_, k) => k !== i));
  for (let i = 0; i < path.length; i++) for (const u of unused) out.push(path.map((t, k) => (k === i ? u : t)));
  if (withInsertions) {
    for (const u of unused) for (let i = 0; i <= path.length; i++) out.push([...path.slice(0, i), u, ...path.slice(i)]);
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const s = [...path];
    [s[i], s[i + 1]] = [s[i + 1] as Token, s[i] as Token];
    out.push(s);
  }
  return out;
}

function audit(label: string, spec: BuildSpec, all: readonly Token[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const a of spec.accept) {
    const path = findBuild(toWords(a.a), all);
    if (!path) continue;
    for (const n of neighbours(path, all)) {
      const key = toWords(n.map((t) => t.t).join(' ')).join(' ');
      if (seen.has(key) || spec.accept.some((x) => toWords(x.a).join(' ') === key)) continue;
      seen.add(key);
      const ev = evaluateBuild(spec, n);
      if (isFailure(ev.outcome)) lines.push(`   ✗ ${ev.outcome.padEnd(16)} ${ev.err?.padEnd(26) ?? ''} ${key}`);
      else if (showUnverified && ev.outcome === 'unverified') lines.push(`   ? unverified       ${key}`);
    }
  }
  return lines.length ? [`${label}`, ...lines] : [];
}

const items: Item[] = [
  ...(skills.length ? [] : CALIBRATION),
  ...(skills.length ? skills : (Object.keys(PACKS) as SkillId[])).flatMap((s) => PACKS[s].items),
];

for (const item of items) {
  if (item.type === 'dialogue') {
    item.turns.forEach((t, i) => {
      const view = buildView(item, i);
      if (view) console.log(audit(`${item.id}#turn${i + 1} — accept: ${t.build.accept.map((a) => a.a).join(' | ')}`, view.spec, view.all).join('\n'));
    });
    continue;
  }
  const view = buildView(item, null);
  if (!view) continue;
  const out = audit(`${item.id} — accept: ${view.spec.accept.map((a) => `${a.a} (${a.o})`).join(' | ')}`, view.spec, view.all);
  if (out.length) console.log(out.join('\n'));
}
