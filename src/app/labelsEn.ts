/** English descriptions of error types, for the voice-tutor card. */
const EN: Record<string, string> = {
  missing_be: 'I drop am/is/are before -ing',
  missing_been: 'I drop "been" (have ___ working)',
  been_v3: 'been + past participle instead of been + -ing',
  present_for_duration: 'I use the present (I am working) for "for two hours / since"',
  past_for_duration: 'I use the past simple for something still going on',
  have_agreement: 'have/has agreement',
  be_agreement: 'am/is/are agreement',
  since_period: '"since" with a period (since two hours)',
  for_point: '"for" with a point in time (for Monday)',
  perfect_with_finished_time: 'present perfect with a finished time (I have sent it yesterday)',
  did_v2: 'did + past form (did you invited)',
  no_inversion: 'word order in direct questions',
  inversion_in_indirect: 'question word order inside indirect questions',
  do_in_indirect: 'do/does inside indirect questions',
  agreement_s: 'missing -s on the verb',
  modal_to: '"to" after a modal (must to go)',
  modal_v2: 'past form after a modal (would visited)',
  have_base: 'have + base verb instead of past participle',
  simple_for_now: 'present simple for what is happening right now',
};

export function errorLabelEn(code: string): string {
  return EN[code] ?? code.replace(/_/g, ' ');
}
