import type { UnitId } from './schema';

/** Short English versions of each unit's explanation (shown when the learner taps "English"). */
export const LESSONS_EN: Readonly<Record<UnitId, { short: string; points: string[] }>> = {
  S01: {
    short: 'Use am / is / are + verb-ing for something happening right now or around now.',
    points: [
      'Both parts are needed: "I am working", never "I working".',
      '"I still work there" (my job) and "I am still working on it" (right now) are both correct, with different meanings.',
      'State verbs (know, need, belong) normally do not take -ing: "I know", not "I am knowing".',
    ],
  },
  S02: {
    short: 'Present perfect = have / has + past participle (V3). It links the past to now without a finished time.',
    points: [
      'The participle is often irregular: written, done, taken, chosen, seen, gone / been.',
      '"already" in statements; "yet" in negatives and questions; "just" for something very recent.',
      '"She has gone to the bank" = she is there now; "She has been to the bank" = she went and came back.',
    ],
  },
  S03: {
    short: 'have / has + been + verb-ing: an activity that started in the past and is still going on (or has just stopped, with a visible result).',
    points: [
      'All three links are needed: have → been → working.',
      'With a duration up to now (for / since / how long), Hebrew uses the present; English does not: "I have been working here for three years".',
      'State verbs use the simple form: "I have known her for years".',
      '"has been approved" is a different structure (passive), not the continuous.',
    ],
  },
  S04: {
    short: 'To ask how long something has lasted up to now: How long + have / has + subject + been + verb-ing?',
    points: [
      'Only have / has moves before the subject: "How long has she been waiting?"',
      'State verbs: "How long have you known Dana?"',
      '"How long did you work there?" = it is over; "How long have you worked / been working here?" = still true.',
    ],
  },
  S05: {
    short: 'for + a period of time (for two hours); since + a starting point (since nine, since 2023, since I moved here).',
    points: [
      'Both usually go with the present perfect when something continues up to now.',
      '"ago" goes with the past simple: "I started two hours ago".',
      'Not "since two hours", not "for Monday".',
    ],
  },
  S06: {
    short: 'A finished time (yesterday, last week, in 2021, two days ago) needs the past simple — even if the result matters now.',
    points: [
      '"I sent the report yesterday, so you can read it now" is correct.',
      'No finished time, or a period still going on (ever, never, yet, so far, this week) → present perfect.',
      'Not "I have sent it yesterday".',
    ],
  },
  S07: {
    short: 'In questions and negatives with do / does / did, the main verb goes back to its base form.',
    points: [
      '"Did you invite them?", not "Did you invited".',
      '"Does she work…?", "She doesn\'t need…" — the -s moves to does / doesn\'t.',
    ],
  },
  S08: {
    short: 'Inside an indirect question the word order is the normal statement order, with no do / does / did.',
    points: [
      '"Could you tell me when it takes effect?" — not "when does it take effect".',
      '"Do you know where the meeting is?" — not "where is the meeting".',
      'Yes / no questions use if or whether: "Do you know if the office is open?"',
    ],
  },
  S09: {
    short: '"Who invited you?" asks about the one who did the action (no did). "Who did you invite?" asks about the one who received it.',
    points: [
      'Subject questions keep statement order: "What happened?", "Which team won?"',
      'Object questions use do / did: "What did you do?", "Which team did you support?"',
    ],
  },
  S10: {
    short: 'After must, can, could, should, would, might and will comes the base verb — no "to", no -s, no past form.',
    points: [
      '"I must go", not "I must to go"; "We would visit", not "We would visited".',
      'But have to, need to, ought to and be able to do take "to": "I have to go" is correct too.',
      '"mustn\'t" = it is not allowed; "don\'t have to" = it is not necessary.',
    ],
  },
  'S11.used_to': {
    short: 'used to + base verb: a past habit or state that is no longer true.',
    points: [
      '"I used to live in Haifa" (I don\'t now).',
      'Questions and negatives: "Did you use to…?", "I didn\'t use to…".',
    ],
  },
  'S11.would': {
    short: 'would + base verb can describe repeated actions in the past — but not states.',
    points: [
      '"Every summer we would visit my grandmother."',
      'For a past state use used to: "I used to live in Haifa", not "I would live in Haifa".',
    ],
  },
  'S11.be_used_to': {
    short: 'be used to + noun / verb-ing = to be accustomed to something.',
    points: ['"I\'m used to working late", not "I\'m used to work late".', '"to" here is a preposition, so an -ing form follows.'],
  },
  'S11.get_used_to': {
    short: 'get used to + noun / verb-ing = the process of becoming accustomed.',
    points: ['"I\'m getting used to working from home."', '"You\'ll get used to it." / "I can\'t get used to the noise."'],
  },
  S12: {
    short: 'Active: who does the action ("The manager has approved the change"). Passive: what receives it ("The change has been approved").',
    points: [
      'Passive present perfect = has / have + been + V3.',
      '"The manager has been approving requests all morning" is active and continuous — a different meaning.',
      '"been" is not always followed by -ing, and not always by V3: the meaning decides.',
    ],
  },
};
