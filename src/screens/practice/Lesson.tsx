import { useState } from 'react';
import type { Lesson, UnitId } from '../../content/schema';
import { UNIT_BY_ID } from '../../content/units';
import { LESSONS_EN } from '../../content/lessonsEn';
import { Chain, En, Inline, RichText } from '../../ui/RichText';
import { IconChevron } from '../../ui/icons';
import { AudioButton } from '../../ui/AudioButton';

/** The unit's explanation in English, shown instead of the Hebrew one when the learner asks. */
export function EnglishExplanation({ unit }: { unit: UnitId }) {
  const en = LESSONS_EN[unit];
  if (!en) return null;
  return (
    <div className="stack-tight" lang="en" dir="ltr" style={{ textAlign: 'left' }}>
      <p className="en">{en.short}</p>
      <ul className="stack-tight" style={{ paddingInlineStart: '1.1rem', listStyle: 'disc' }}>
        {en.points.map((p, i) => (
          <li key={i} className="en small">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LanguageToggle({ english, onChange }: { english: boolean; onChange: (en: boolean) => void }) {
  return (
    <button type="button" className="chip-btn" aria-pressed={english} onClick={() => onChange(!english)}>
      {english ? 'עברית' : 'English'}
    </button>
  );
}

export function LessonView({ lesson, bridge }: { lesson: Lesson; bridge?: string | null }) {
  const [deep, setDeep] = useState(false);
  const [english, setEnglish] = useState(false);
  const meta = UNIT_BY_ID[lesson.unit as UnitId];
  return (
    <article className="lesson">
      {bridge && (
        <div className="bridge">
          <RichText text={bridge} />
        </div>
      )}
      <header className="stack-tight">
        <div className="row-between">
          <span className="unit-label">{meta.labelEn}</span>
          <LanguageToggle english={english} onChange={setEnglish} />
        </div>
        <h2 className="lesson-title">
          <Inline text={lesson.title} />
        </h2>
      </header>
      {english ? <EnglishExplanation unit={lesson.unit} /> : <RichText text={lesson.short} />}
      {lesson.chain && <Chain links={lesson.chain} />}
      {lesson.contrast && (
        <section className="stack-tight" aria-label="השוואה">
          <div className="contrast">
            <div>
              <div className="row-between">
                <En className="example-en">{lesson.contrast.a.en}</En>
                <AudioButton text={lesson.contrast.a.en} />
              </div>
              <div className="muted small">{lesson.contrast.a.he}</div>
            </div>
            <div>
              <div className="row-between">
                <En className="example-en">{lesson.contrast.b.en}</En>
                <AudioButton text={lesson.contrast.b.en} />
              </div>
              <div className="muted small">{lesson.contrast.b.he}</div>
            </div>
          </div>
          <RichText text={lesson.contrast.note} className="small" />
        </section>
      )}
      <section className="stack-tight" aria-label="דוגמאות">
        <h3 className="section-title">דוגמאות</h3>
        <ul className="example-list">
          {lesson.examples.map((e, i) => (
            <li key={i}>
              <div className="row-between">
                <En className="example-en">{e.en}</En>
                <AudioButton text={e.en} />
              </div>
              <span className="he">{e.he}</span>
            </li>
          ))}
        </ul>
      </section>
      <div>
        <button type="button" className="expander" aria-expanded={deep} onClick={() => setDeep((d) => !d)}>
          <IconChevron />
          {deep ? 'פחות' : 'הסבר מלא ומלכודות נפוצות'}
        </button>
        {deep && (
          <div className="stack">
            <RichText text={lesson.deep} />
            {lesson.pitfalls && lesson.pitfalls.length > 0 && (
              <section className="stack-tight">
                <h3 className="section-title">מלכודות נפוצות</h3>
                <RichText text={lesson.pitfalls.map((p) => `• ${p}`).join('\n')} className="pitfalls" />
              </section>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
