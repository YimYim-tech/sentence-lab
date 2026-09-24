import type { BuildView } from './builder';
import type { Token } from '../content/schema';
import { findBuild } from '../content/validate';
import { toWords } from './evaluate';

export interface QuickChoice {
  id: string;
  text: string;
  tokenIds: string[];
  isTarget: boolean;
}

/** Formats text to start with a capital letter and end without punctuation */
function cleanSentence(s: string, lead?: string): string {
  let text = s.trim().replace(/[.,!?;:]+$/, '');
  if (!lead && text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
}

/**
 * Generates 2 focused, high-contrast choices for an assemble / transform / correct task:
 * 1. The target correct sentence.
 * 2. The primary plausible distractor / common error authored for this task.
 */
export function getQuickChoices(view: BuildView, seed: number = 0): QuickChoice[] | null {
  const spec = view.spec;
  const lead = spec.lead;

  // 1. Target answer
  const targetAccepted = spec.accept.find((a) => a.o === 'correct_target') ?? spec.accept[0];
  if (!targetAccepted) return null;

  const targetWords = toWords(targetAccepted.a);
  const targetTokens = findBuild(targetWords, view.all);
  if (!targetTokens || targetTokens.length === 0) return null;

  const targetChoice: QuickChoice = {
    id: 'target',
    text: cleanSentence(targetAccepted.a, lead),
    tokenIds: targetTokens.map((t) => t.id),
    isTarget: true,
  };

  // 2. Find a plausible distractor
  let wrongChoice: QuickChoice | null = null;

  // 2a. If there is a source sentence (e.g. in 'correct' or 'transform' items) that isn't accepted
  if (view.source.length > 0) {
    const sourceWords = view.source.flatMap((t) => toWords(t.t));
    const sourceText = cleanSentence(view.source.map((t) => t.t).join(' '), lead);
    const isSourceAccepted = spec.accept.some((a) => toWords(a.a).join(' ') === sourceWords.join(' '));
    if (!isSourceAccepted && sourceText.toLowerCase() !== targetChoice.text.toLowerCase()) {
      wrongChoice = {
        id: 'source_error',
        text: sourceText,
        tokenIds: view.source.map((t) => t.id),
        isTarget: false,
      };
    }
  }

  // 2b. Check authored wrong answers
  if (!wrongChoice) {
    for (let i = 0; i < (spec.wrong ?? []).length; i++) {
      const w = spec.wrong![i]!;
      const wWords = toWords(w.a);
      const wTokens = findBuild(wWords, view.all);
      if (wTokens && wTokens.length > 0) {
        const text = cleanSentence(w.a, lead);
        if (text.toLowerCase() !== targetChoice.text.toLowerCase()) {
          wrongChoice = {
            id: `wrong_${i}`,
            text,
            tokenIds: wTokens.map((t) => t.id),
            isTarget: false,
          };
          break;
        }
      }
    }
  }

  // 2c. If no authored wrong can be built directly, try swapping a distractor token
  if (!wrongChoice) {
    const distractorTokens = view.all.filter((t) => Boolean(t.why));
    for (const distractor of distractorTokens) {
      const distWords = toWords(distractor.t);
      if (distWords.length === 0) continue;

      // Try replacing one token in targetTokens with this distractor
      for (let pos = 0; pos < targetTokens.length; pos++) {
        const candidateTokens = [...targetTokens];
        candidateTokens[pos] = distractor;

        const candidateText = candidateTokens.map((t) => t.t).join(' ');
        if (candidateText.toLowerCase() !== targetAccepted.a.toLowerCase()) {
          wrongChoice = {
            id: `distractor_${distractor.id}`,
            text: cleanSentence(candidateText, lead),
            tokenIds: candidateTokens.map((t) => t.id),
            isTarget: false,
          };
          break;
        }
      }
      if (wrongChoice) break;
    }
  }

  // 2d. Fallback: if there's an alternative accepted answer that uses different wording
  if (!wrongChoice && spec.accept.length > 1) {
    for (let i = 1; i < spec.accept.length; i++) {
      const alt = spec.accept[i]!;
      const altTokens = findBuild(toWords(alt.a), view.all);
      if (altTokens && alt.a.toLowerCase() !== targetAccepted.a.toLowerCase()) {
        wrongChoice = {
          id: `alt_${i}`,
          text: cleanSentence(alt.a, lead),
          tokenIds: altTokens.map((t) => t.id),
          isTarget: true,
        };
        break;
      }
    }
  }

  if (!wrongChoice) return null;

  // Alternate order based on seed so target isn't always first
  const choices = (seed % 2 === 0)
    ? [targetChoice, wrongChoice]
    : [wrongChoice, targetChoice];

  return choices;
}
