import { useState } from 'react';
import { LESSONS } from '../content';
import type { UnitId } from '../content/schema';
import { EXPANSION_MAP, UNIT_BY_ID, UNITS } from '../content/units';
import { FOCUS_ORDER } from '../engine/config';
import { unitEvidence } from '../engine/progress';
import { isDue } from '../engine/schedule';
import { chooseFocus } from '../engine/select';
import { formatDay, formatDue } from '../engine/time';
import { clockNow, useApp } from '../app/store';
import { RichText } from '../ui/RichText';
import { Dialog, ScreenHeader, Section, StatusChip } from './common';
import { LessonView } from './practice/Lesson';

const PRIOR_LABEL = { taught: 'העמקה', encountered: 'חדש — הופיע בעבר בלי הסבר', none: 'חדש' } as const;

export function PathScreen() {
  const { snap } = useApp();
  const [open, setOpen] = useState<UnitId | null>(null);
  const now = clockNow();
  const focus = snap.profile.firstSegmentDone ? chooseFocus(snap).unit : ('S03' as UnitId);
  const ev = (u: UnitId) => unitEvidence(u, snap.attempts, snap.units[u]);
  const after = FOCUS_ORDER.slice(FOCUS_ORDER.indexOf(focus) + 1)
    .filter((u) => ev(u).status === 'not_checked' || ev(u).status === 'practicing')
    .slice(0, 3);
  const scheduled = Object.values(snap.units)
    .filter((u) => u.step >= 0 && u.dueAt !== null && u.unit !== focus)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const row = (u: UnitId, extra?: string) => {
    const meta = UNIT_BY_ID[u];
    return (
      <li key={u} className="unit-row">
        <div className="top">
          <button type="button" className="name" onClick={() => setOpen(u)}>
            {meta.nameHe}
            <span className="unit-label" style={{ display: 'block' }}>
              {meta.labelEn}
            </span>
          </button>
          <StatusChip status={ev(u).status} />
        </div>
        <div className="row">
          <span className={`tag${meta.prior === 'taught' ? '' : ' accent'}`}>{PRIOR_LABEL[meta.prior]}</span>
          {extra && <span className="faint">{extra}</span>}
        </div>
      </li>
    );
  };

  return (
    <main className="screen" aria-label="המסלול שלי">
      <ScreenHeader title="המסלול שלי">
        <p className="muted">
          המסלול מתחיל מהמקום שבו עצרת בשיעורים הקודמים, לא מקורס למתחילים. נושא חדש נפתח כשיש ראיות לשליטה — לא לפי
          מספר ימים.
        </p>
      </ScreenHeader>

      <Section title="במוקד עכשיו">
        <ul>{row(focus)}</ul>
        <RichText text={UNIT_BY_ID[focus].whyHe} className="small muted" />
      </Section>

      {after.length > 0 && (
        <Section title="הבא בתור">
          <ul>{after.map((u) => row(u))}</ul>
        </Section>
      )}

      {scheduled.length > 0 && (
        <Section title="חזרה מפוזרת">
          <ul>
            {scheduled.map((s) =>
              row(s.unit, s.dueAt ? (isDue(s, now) ? 'לחזרה היום' : `חזרה ${formatDue(s.dueAt, now)}`) : undefined),
            )}
          </ul>
        </Section>
      )}

      <Section title="כל הנושאים בתרגול">
        <ul>{UNITS.map((u) => row(u.id))}</ul>
      </Section>

      <Section title="מפת הרחבה">
        <p className="small muted">נושאים מהמפה המקורית. עדיין אין להם תרגול באפליקציה, ולכן הם לא כפתורים.</p>
        <ul className="list-plain">
          {EXPANSION_MAP.map((x) => (
            <li key={x.en}>
              <span>{x.he}</span>
              <span className="unit-label">{x.en}</span>
            </li>
          ))}
        </ul>
      </Section>

      {open && (
        <Dialog title={UNIT_BY_ID[open].nameHe} onClose={() => setOpen(null)}>
          <UnitSheet unit={open} />
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(null)}>
            סגור
          </button>
        </Dialog>
      )}
    </main>
  );
}

function UnitSheet({ unit }: { unit: UnitId }) {
  const meta = UNIT_BY_ID[unit];
  const lesson = LESSONS.get(unit);
  return (
    <div className="stack">
      {lesson ? <LessonView lesson={lesson} /> : <p className="muted">ההסבר לנושא הזה עוד לא זמין.</p>}
      {meta.priorRecords.length > 0 && (
        <section className="stack-tight">
          <h3 className="section-title">מה ידוע מהשיעורים הקודמים</h3>
          <p className="faint">רשומה לתעדוף בלבד — לא מדידה, ולא נספרת בהתקדמות.</p>
          <ul className="list-plain">
            {meta.priorRecords.map((r, i) => (
              <li key={i} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                {r.example && (
                  <span className="en" lang="en" dir="ltr">
                    {r.example}
                  </span>
                )}
                <span className="small muted">
                  {formatDay(Date.parse(r.sourceDate))} · {r.noteHe}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
