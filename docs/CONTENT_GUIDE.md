# Sentence Lab — content authoring guide

You are writing learning content for a personal, tap-only English grammar trainer.
Read `src/content/schema.ts` (the types, with comments) and the finished examples first:
`src/content/skills/s03.ts` (full style reference, incl. a lesson and a dialogue),
`src/content/skills/s01.ts`, `s04.ts`, `s05.ts`, `s06.ts`, `src/content/calibration.ts`.

## The learner

- Adult Hebrew speaker. Understands English very well; the problem is producing correct grammar
  in real time: auxiliaries, the verb form after them, word order in questions, choosing the
  structure that fits the meaning.
- Errors seen in his own lesson transcripts: `I still working there.` · `I have working on the
  report for two hours.` · `I've sent the report yesterday.` · `Could you tell me when does it take
  effect?` · `Who did you invited?` · `I must to go.` · `We would visited.`
- He wants to understand *why* (meaning and use, not just a formula). Short Hebrew→English prompts
  help him, but he must move on to building from situations. Trivial repetition frustrates him.
  He is very sensitive to a valid sentence being marked wrong and to contradictory corrections.
- Contexts: meetings, reports, email, schedule changes, decisions, work in a clinic or a
  municipality, software, everyday life. Never include patient or client details. Don't imply a
  specific profession, age or family details.

## How the app uses your content

- UI is Hebrew (RTL); English is shown LTR. The learner never types.
- Build tasks (assemble / correct / transform / dialogue turns): he taps tokens from a bank into an
  answer line, taps a placed token to send it back, and can move an insertion caret.
  `correct` and `transform` start with `source` already in the answer line; `tokens` is the extra bank.
- An answer is judged in this order:
  1. `accept` (exact match after normalisation) → `correct_target` / `valid_alternative` / `target_not_used`
  2. `wrong` (exact known wrong sentences) → its outcome + feedback
  3. `rules` (first matching rule) → its outcome + feedback
  4. a distractor token was used → that token's `why`
  5. an unfinished prefix of an accepted answer → neutral "incomplete"
  6. anything else → `unverified`: a neutral message, never counted as wrong.
- Normalisation: lower case, all punctuation removed, words compared. So:
  tokens contain no punctuation; the final `end` punctuation is added automatically; commas are
  allowed in `accept` strings for display only. A token may be several words (`on the report`);
  token boundaries never matter for matching.
- Outcomes:
  - `correct_target` — correct and uses the structure being practised.
  - `valid_alternative` — correct and fits the situation, different wording. Counts as success.
  - `target_not_used` — grammatical, but avoids the structure that the item's `target` field
    explicitly asked for. Neutral (no penalty). Only allowed when the item has `target`.
  - `form_error` — grammar error, only when your item establishes it (wrong/rule/distractor).
  - `meaning_mismatch` — grammatical, but says something the situation does not mean.
- Help buttons the learner can tap: hint (`hint`), why (`explain` + `deep`), what's the difference
  (`diff`, falls back to the lesson contrast), another example (pack `examples`), translation (`trHe`).

## Hard rules (the validator enforces most of them)

1. Every accepted answer must be buildable from the available tokens (source + tokens).
2. A rule must never match an accepted answer.
3. Every token that appears in no accepted answer needs `why` (Hebrew) and `err`. The `why` must be
   true for **every** non-accepted use of that token — write it for the token, not for one sentence.
   Put specific combinations (e.g. `been worked`) in `rules`, which run before distractors.
4. When more than one answer is right for the situation, accept all of them. If you want one
   structure specifically, say so in `target` (shown before the attempt) and list the others as
   `target_not_used` (grammatical, not the structure) or `valid_alternative` (also the structure).
   Give every non-`correct_target` answer a `note`.
5. Tokens are lower case except `I` and proper nouns. (The first word is capitalised automatically;
   a capitalised token would give away the start of the sentence.) No punctuation in tokens.
6. Never hand over the structure being tested as one token: when the verb chain is the target,
   `have`, `been`, `working` are separate tokens. Group what is not the target (`on the report`,
   `for two hours`) so the bank stays at ~6–12 tokens.
7. Distractors are plausible learner errors (wrong auxiliary, wrong verb form, for/since swap,
   extra `to`, `do` inside an indirect question…) similar in length and style to the real pieces.
   No absurd distractors. Each needs a specific Hebrew reason.
8. `discriminate` options: similar length and style; every option has a specific `why`; if more
   than one option fits, set `multi: true` (the learner then selects all that fit).
9. `correct` items: in about one of four, the given sentence is already correct (the answer is
   "no correction needed" = the unchanged source, listed in `accept`). The unchanged source must
   always be classified (in `accept`, or in `wrong`).
10. `transform` items: the unchanged source must be in `wrong` (normally `target_not_used`,
    "this is a correct X, but you were asked to turn it into Y"), and the item must have `target`.
11. `explain` is at most 2 short sentences. Put more in `deep`. `hint` nudges; it is not the answer.
12. Hebrew: natural, concise, adult. Wrap every English fragment inside Hebrew in backticks.
    No exclamation-mark enthusiasm, no emojis, no "כל הכבוד".
13. Stages: stage 1 = supported (`promptHe` Hebrew sentence to express and/or `scaffold` chain);
    stage 2 = a situation (`sitHe`, or `sitEn` + `trHe` for advanced items) without a model;
    stage 3 = contrast between close structures. Mix per unit ≈ 30% / 45% / 25%.
    Include some `sitEn` items (English situation) — needed for the "situation without a ready
    Hebrew sentence" evidence.
14. `role: 'check'` items are reserved for exit and delayed checks: stage 2–3, no scaffold, a context
    family not used by that unit's stage-1 items. Never reuse their sentences in lessons, examples or
    other items.
15. Original sentences only — do not copy exercises from books or websites.
16. A name/day/number swap is not a new item. Vary situations for real.
17. American spelling throughout (neighbor, color, center, organize).
18. Avoid traps you don't intend to test: emphatic `did` + base (`I did send it`) is grammatical —
    don't offer `did` + base where that would be a valid answer unless you accept it; avoid
    collective subjects (team, staff, family) where both has/have are valid; avoid contractions in
    banks unless the item is about them (and then accept both forms where both are buildable).

## Linguistic cautions (must be honoured)

- `I've lived here for three years` and `I've been living here for three years` can both describe
  living here now. `I've worked here for three years` is not wrong just because the work continues.
- `I sent the report yesterday, so you can read it now` is correct: a link to the present does not
  force present perfect when a finished time (`yesterday`) is stated.
- `I still work there` and `I'm still working there` can both be correct; `I still working there`
  lacks the auxiliary.
- Present perfect continuous can also describe an activity that has just stopped with a visible
  result (`I'm tired — I've been running`); never teach that it always continues right now.
  Stative verbs (`know`, `believe`, `own`, `need`) need separate handling — no automatic -ing.
- `The change has been approved` is present perfect passive, not present perfect continuous.
  `The manager has been approving requests` is a different structure with a different meaning.
  Never teach "been is always followed by -ing".
- Indirect questions: `Could you tell me when it takes effect?` is correct — no `does` inside.
- `Who invited you?` and `Who did you invite?` are not interchangeable; the situation must make
  clear who invites whom.
- `The new schedule takes effect next Monday` and `…will take effect next Monday` can both be correct.
- `got`/`gotten` in the right contexts, and `if`/`whether` in simple yes/no indirect questions, must
  not be rejected as a dialect preference. Don't claim they are interchangeable in every context.
- `at` / `in the municipality` depends on context — no blanket bans. `I asked if they received the
  email` does not necessarily require `had received`.
- American informal `Did you send it yet?` / `I didn't get it yet` exist: don't mark them as errors;
  if the item wants present perfect, state it in `target` and classify them as `target_not_used`.

## What each pack must contain

- Export `SXX: SkillPack` from `src/content/skills/sXX.ts` (keep existing items unchanged).
- `lessons`: one per unit, in the style of the S03 lesson: `title`, `short` (≤ 2 sentences),
  `chain` where it helps, 2–4 `examples` (en + he), `contrast` (two close sentences + a note),
  `deep` (bullets starting with "• ", separated by "\n"), `pitfalls`.
- `examples`: per unit, 3–4 extra example sentences (en + he) for the "another example" button.
  Never reuse check-item sentences there.
- `items` (see your assignment for counts). Per skill: ≥ 8 practice + ≥ 2 check items, ≥ 3 context
  families, more than one task type, at least 60% build tasks (non-`discriminate`), at least one
  dialogue item with 2 turns, and at least one item that separates form from meaning (e.g. a
  discrimination with one ungrammatical option and one grammatical-but-wrong-meaning option).
- IDs: practice `SXX-01`, `SXX-02`…; checks `SXX-C1`, `SXX-C2`…; dialogues `SXX-D1`…
  (S11 uses `S11-U-…` used to, `S11-W-…` would, `S11-B-…` be used to, `S11-G-…` get used to).
  `fam`: `'SXX.short-slug'`; items that are substitutions of each other share it. `v: 1`.
- `ctx` must be a key of `CONTEXT_FAMILIES` in schema.ts.

## Checking your work

```
npx tsx scripts/validate-content.ts --skill SXX
npx tsc -p tsconfig.json --noEmit
```

Zero errors. Review every warning; leave one only when you can justify it.
Then re-read each item as the learner: would every sentence you accept really be accepted by a
careful teacher, and would every sentence you reject really be rejected? Is every distractor's
reason true in every position it could be placed?
