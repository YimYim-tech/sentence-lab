/**
 * Content validator.
 *   npm run validate:content                 → all packs
 *   npm run validate:content -- --skill S05  → one pack (repeatable)
 *   add --strict to fail on warnings too
 */
import { PACKS, CALIBRATION } from '../src/content/index';
import type { SkillId } from '../src/content/schema';
import { UNITS_BY_SKILL } from '../src/content/units';
import { packStats, validateItem, validatePack, type Issue } from '../src/content/validate';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only: SkillId[] = [];
args.forEach((a, i) => {
  if (a === '--skill' && args[i + 1]) only.push(args[i + 1] as SkillId);
});

const skills = (only.length ? only : (Object.keys(PACKS) as SkillId[])).filter((s) => PACKS[s]);
let errors = 0;
let warnings = 0;

function report(title: string, issues: Issue[]): void {
  const e = issues.filter((i) => i.level === 'error');
  const w = issues.filter((i) => i.level === 'warn');
  errors += e.length;
  warnings += w.length;
  console.log(`\n=== ${title}: ${e.length} error(s), ${w.length} warning(s)`);
  for (const i of [...e, ...w]) console.log(`  ${i.level === 'error' ? 'ERROR' : 'warn '} [${i.where}] ${i.msg}`);
}

for (const s of skills) {
  const pack = PACKS[s];
  const issues = validatePack(pack, UNITS_BY_SKILL[s] ?? []);
  report(`${s} (${pack.items.length} items)`, issues);
  const st = packStats(pack.items.filter((i) => i.role !== 'calibration'));
  console.log(
    `  stats: types ${JSON.stringify(st.byType)} roles ${JSON.stringify(st.byRole)} stages ${JSON.stringify(
      st.byStage,
    )} contexts ${st.contexts.length} production ${Math.round(st.productionShare * 100)}%`,
  );
}

if (!only.length) {
  const calIssues: Issue[] = [];
  for (const item of CALIBRATION) validateItem(item, calIssues);
  const units = CALIBRATION.map((c) => c.unit).sort().join(',');
  if (units !== 'S01,S03,S06,S08') calIssues.push({ level: 'error', where: 'calibration', msg: `units ${units}` });
  report('calibration', calIssues);

  const seen = new Map<string, string>();
  const globalIssues: Issue[] = [];
  for (const item of [...CALIBRATION, ...Object.values(PACKS).flatMap((p) => p.items)]) {
    if (seen.has(item.id)) globalIssues.push({ level: 'error', where: item.id, msg: 'id used twice across packs' });
    seen.set(item.id, item.skill);
  }
  report('global', globalIssues);
  const total = Object.values(PACKS).reduce((n, p) => n + p.items.length, 0);
  console.log(`\nTotal items: ${total} (+ ${CALIBRATION.length} calibration)`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 || (strict && warnings > 0) ? 1 : 0);
