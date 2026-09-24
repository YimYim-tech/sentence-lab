/**
 * Voice bridge: a lesson card for a spoken tutor (ChatGPT / Gemini voice), generated
 * deterministically from the learner's own data. The app sends nothing anywhere — the learner
 * copies the text and pastes it into a chat before driving.
 */
import type { BuildSpec, Item, UnitId } from '../content/schema';
import { UNIT_BY_ID } from '../content/units';
import { displaySentence, isFailure } from '../engine/evaluate';
import { chooseFocus, type ContentIndex } from '../engine/select';
import { isDue } from '../engine/schedule';
import type { Snapshot } from '../engine/types';
import { errorLabelEn } from './labelsEn';

export interface VoiceCardResult {
  text: string;
  units: UnitId[];
  items: number;
}

function answers(spec: BuildSpec): { main: string; alts: string[] } {
  const target = spec.accept.find((a) => a.o === 'correct_target') ?? spec.accept[0];
  const main = target ? displaySentence(target.a, spec.end, spec.lead) : '';
  const alts = spec.accept
    .filter((a) => a !== target && a.o !== 'target_not_used')
    .map((a) => displaySentence(a.a, spec.end, spec.lead));
  return { main, alts };
}

function sourceText(item: Item): string {
  if (item.type !== 'correct' && item.type !== 'transform') return '';
  const s = item.source.map((t) => t.t).join(' ');
  const end = item.type === 'transform' ? item.sourceEnd : item.end;
  return s.charAt(0).toUpperCase() + s.slice(1) + end;
}

function itemLines(item: Item): string[] | null {
  switch (item.type) {
    case 'assemble': {
      const prompt = item.promptHe ?? item.sitHe;
      if (!prompt) return null;
      const { main, alts } = answers(item);
      return [
        `Say in English (Hebrew prompt): "${prompt}"`,
        `   Expected: "${main}"${alts.length ? `  Also correct: ${alts.map((a) => `"${a}"`).join(', ')}` : ''}`,
      ];
    }
    case 'correct': {
      const { main, alts } = answers(item);
      const src = sourceText(item);
      const alreadyOk = item.accept.some((a) => a.a.toLowerCase() === item.source.map((t) => t.t).join(' ').toLowerCase());
      return [
        `Read this sentence aloud and ask me to fix it${alreadyOk ? ' (it may already be correct)' : ''}: "${src}"`,
        `   Expected: "${main}"${alts.length ? `  Also correct: ${alts.map((a) => `"${a}"`).join(', ')}` : ''}`,
      ];
    }
    case 'transform': {
      const { main, alts } = answers(item);
      return [
        `Ask me to change "${sourceText(item)}" into: ${item.toLabel === 'שאלה עקיפה' ? 'an indirect question' : `the form "${item.toLabel}"`}${item.target ? '' : ''}`,
        `   Expected: "${main}"${alts.length ? `  Also correct: ${alts.map((a) => `"${a}"`).join(', ')}` : ''}`,
      ];
    }
    case 'dialogue': {
      const lines: string[] = [];
      item.turns.forEach((t, i) => {
        const { main, alts } = answers(t.build);
        lines.push(
          `${i === 0 ? 'Role-play' : '   then'}: you say "${t.partner.en}" — I answer (${t.instr})`,
          `   Expected: "${main}"${alts.length ? `  Also correct: ${alts.map((a) => `"${a}"`).join(', ')}` : ''}`,
        );
      });
      return lines;
    }
    default:
      return null;
  }
}

export function buildVoiceCard(snap: Snapshot, idx: ContentIndex, now: number): VoiceCardResult {
  const focus = snap.profile.firstSegmentDone ? chooseFocus(snap).unit : ('S03' as UnitId);
  const recentSegments = new Set([...snap.segments].slice(-3).map((s) => s.segmentId));
  const recentErrors = snap.attempts.filter(
    (a) => recentSegments.has(a.segmentId) && a.kind === 'main' && isFailure(a.outcome) && !a.excluded,
  );
  const errorUnits = [...new Set(recentErrors.map((a) => a.unit))];
  const due = Object.values(snap.units)
    .filter((u) => isDue(u, now))
    .map((u) => u.unit);
  const units = [...new Set<UnitId>([focus, ...errorUnits, ...due])].slice(0, 3);

  const picked: Item[] = [];
  for (const u of units) {
    const pool = idx.items.filter(
      (it) => it.unit === u && it.role === 'practice' && it.type !== 'discriminate' && itemLines(it) !== null,
    );
    // prefer items already practised (and missed) in the app: speaking them is retrieval, not new material
    const missed = new Set(recentErrors.filter((a) => a.unit === u).map((a) => a.itemId));
    const seen = (it: Item) => Boolean(snap.exposures[it.id]);
    const ranked = [...pool].sort(
      (a, b) =>
        Number(missed.has(b.id)) - Number(missed.has(a.id)) || Number(seen(b)) - Number(seen(a)) || a.stage - b.stage,
    );
    picked.push(...ranked.slice(0, units.length === 1 ? 10 : 5));
  }
  const list = picked.slice(0, 12);

  const errorsByUnit = (u: UnitId) => {
    const counts = new Map<string, number>();
    for (const a of recentErrors.filter((x) => x.unit === u && x.errorType)) {
      counts.set(a.errorType as string, (counts.get(a.errorType as string) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => errorLabelEn(e));
  };

  const date = new Date(now).toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`ENGLISH GRAMMAR DRILL — voice session card (from my Sentence Lab app, ${date})`);
  out.push('');
  out.push(
    "You are my spoken-grammar drill partner. I'm an adult Hebrew speaker. I understand English well, but I make grammar mistakes when I speak. I'm driving: this is listening and speaking only.",
  );
  out.push('');
  out.push("TODAY'S TARGET STRUCTURES");
  units.forEach((u, i) => {
    const errs = errorsByUnit(u);
    out.push(`${i + 1}. ${UNIT_BY_ID[u].labelEn}${errs.length ? ` — my recent mistakes: ${errs.join('; ')}` : ''}`);
  });
  out.push('');
  out.push('HOW TO RUN THE SESSION (follow exactly)');
  out.push('- You lead the whole time. Never end the session, never summarize, never ask "shall we continue?". Stop only when I say "stop" or "pause"; when I say "continue", pick up where we were.');
  out.push('- One item at a time. Read the prompt, then wait for my answer.');
  out.push('- Correct (or one of the accepted alternatives): say "Correct" and go straight to the next item.');
  out.push('- Wrong: first say in ONE short sentence what is wrong, as a hint (for example "one word is missing between have and working"). Let me try once more. Then say the correct sentence once, I repeat it, and we move on.');
  out.push("- A different but correct sentence is correct. Contractions (I've, she's, haven't) are always fine.");
  out.push('- Correct only the target structure, unless another mistake changes the meaning.');
  out.push('- Keep your turns short (one or two sentences). No lists and no long explanations unless I ask "why?".');
  out.push('- Bring back items I got wrong after 3–5 other items.');
  out.push('- Do not switch to a new grammar topic. When the list is finished, repeat the items I missed, then make up new items for the SAME structures in the same style, and keep going.');
  out.push('');
  out.push('ITEMS');
  let n = 0;
  for (const it of list) {
    const lines = itemLines(it);
    if (!lines) continue;
    n += 1;
    out.push(`${n}. ${lines[0]}`);
    out.push(...lines.slice(1));
  }
  out.push('');
  out.push('Start now with item 1.');
  return { text: out.join('\n'), units, items: n };
}
