import { useState } from 'react';
import type { TaskType, UnitId } from '../content/schema';
import { UNIT_BY_ID, UNITS } from '../content/units';
import { isSuccess } from '../engine/evaluate';
import { isBuildOpportunity, unitEvidence, type UnitEvidence } from '../engine/progress';
import { formatDateTime, formatInterval } from '../engine/time';
import { errorLabel } from '../app/labels';
import { useApp } from '../app/store';
import { IconMic, IconProgress } from '../ui/icons';
import { ScreenHeader, Section, StatusChip } from './common';
import { VoiceCard } from './VoiceCard';

const TYPE_HE: Record<TaskType, string> = {
  assemble: 'הרכבה',
  correct: 'תיקון',
  transform: 'שינוי משפט',
  discriminate: 'בחירה לפי משמעות',
  dialogue: 'דיאלוג',
};

export function ProgressScreen() {
  const { snap } = useApp();
  const [voice, setVoice] = useState(false);
  const started = UNITS.map((u) => unitEvidence(u.id, snap.attempts, snap.units[u.id])).filter((e) => e.mainAttempts > 0);

  if (snap.attempts.length === 0) {
    return (
      <main className="screen" aria-label="ההתקדמות שלי">
        <ScreenHeader title="ההתקדמות שלי" />
        <div className="empty-state">
          <IconProgress />
          <p>עוד אין נתונים.</p>
          <p className="small">
            ההתקדמות תופיע כאן אחרי התרגילים הראשונים — רק מהתשובות שלך באפליקציה, בלי ניחושים ובלי ציון כללי.
          </p>
        </div>
      </main>
    );
  }

  const opps = snap.attempts.filter(isBuildOpportunity);
  const oppsOk = opps.filter((a) => isSuccess(a.outcome)).length;
  const delayed = Object.values(snap.units).flatMap((u) => u.retention);
  const main = snap.attempts.filter((a) => a.kind === 'main' && !a.excluded);
  const activeMinutes = Math.round(
    main.reduce((sum, a) => sum + Math.min(Math.max(a.submittedAt - a.shownAt, 0), 3 * 60_000), 0) / 60_000,
  );
  const helpUses = snap.events.filter((e) => e.type === 'help_used').length;
  const openReports = snap.reports.filter((r) => r.status === 'open').length;
  const completed = snap.segments.filter((s) => s.completed && s.kind !== 'calibration').length;
  const stopped = snap.segments.filter((s) => !s.completed).length;
  const saveFailures = snap.events.filter((e) => e.type === 'save_failed').length;

  return (
    <main className="screen" aria-label="ההתקדמות שלי">
      <ScreenHeader title="ההתקדמות שלי">
        <p className="muted small">
          ראיות, לא ציון: כמה פעמים בנית נכון בניסיון הראשון בלי רמז, ומה נשמר אחרי מרווח זמן. דיבור עצמאי לא נמדד
          באפליקציה הזאת.
        </p>
      </ScreenHeader>

      <Section title="במבט כללי">
        <dl className="evidence">
          <dt>בנייה נכונה בניסיון ראשון, בלי רמז</dt>
          <dd>
            {oppsOk} מתוך {opps.length}
          </dd>
          <dt>בדיקות לאחר מרווח שעברו</dt>
          <dd>
            {delayed.filter((d) => d.ok).length} מתוך {delayed.length}
          </dd>
          <dt>מקטעים שהושלמו</dt>
          <dd>{completed}</dd>
        </dl>
      </Section>

      <Section title="לפי נושא">
        <ul>
          {started.map((e) => (
            <UnitEvidenceRow key={e.unit} ev={e} />
          ))}
        </ul>
      </Section>

      <Section title="מקטעים אחרונים">
        <ul className="list-plain">
          {[...snap.segments]
            .reverse()
            .slice(0, 8)
            .map((s) => (
              <li key={s.segmentId}>
                <span className="stack-tight" style={{ gap: 0 }}>
                  <span>{s.kind === 'calibration' ? 'כיול' : s.focusUnit ? UNIT_BY_ID[s.focusUnit].nameHe : 'מקטע'}</span>
                  <span className="faint">{formatDateTime(s.endedAt)}</span>
                </span>
                <span className="faint num">
                  {s.tasksDone}/{s.tasksPlanned} {s.completed ? '' : '· נעצר'}
                </span>
              </li>
            ))}
        </ul>
      </Section>

      <Section title="נתוני שימוש (נשמרים רק במכשיר)">
        <dl className="evidence">
          <dt>זמן תרגול פעיל (משוער)</dt>
          <dd>{activeMinutes} דק׳</dd>
          <dt>שימוש בעזרה</dt>
          <dd>{helpUses}</dd>
          <dt>מקטעים שנעצרו באמצע</dt>
          <dd>{stopped}</dd>
          <dt>דיווחים פתוחים על שאלות</dt>
          <dd>{openReports}</dd>
          {saveFailures > 0 && (
            <>
              <dt>כשלי שמירה</dt>
              <dd>{saveFailures}</dd>
            </>
          )}
        </dl>
        <p className="faint">זמן השימוש הוא נתון שימוש בלבד — לא מדד שטף, ואין יעד מהירות.</p>
      </Section>

      <section className="panel stack-tight" aria-label="תרגול קולי">
        <h2 className="section-title">גשר לתרגול הקולי</h2>
        <p className="small">
          כרטיס שיעור לנסיעה, שנבנה מהתשובות שלך כאן: מה לתרגל, משפטים בעברית עם התשובות, וכללים שמונעים מהמורה הקולי
          לסיים מוקדם או להחליף נושא. מדביקים אותו בשיחה עם ChatGPT או Gemini לפני הנסיעה.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setVoice(true)}>
          <IconMic />
          הכן כרטיס לתרגול קולי
        </button>
      </section>
      {voice && <VoiceCard onClose={() => setVoice(false)} />}
    </main>
  );
}

function UnitEvidenceRow({ ev }: { ev: UnitEvidence }) {
  const meta = UNIT_BY_ID[ev.unit as UnitId];
  const last = ev.delayed.last;
  const windowFilled = Array.from({ length: 5 }, (_, i) => i < ev.window.ok);
  return (
    <li className="unit-row">
      <div className="top">
        <span className="name">{meta.nameHe}</span>
        <StatusChip status={ev.status} />
      </div>
      <dl className="evidence">
        <dt>בנייה בלי רמז, ניסיון ראשון</dt>
        <dd>
          {ev.build.ok} מתוך {ev.build.total}
        </dd>
        {ev.meaning.total > 0 && (
          <>
            <dt>בחירה לפי משמעות</dt>
            <dd>
              {ev.meaning.ok} מתוך {ev.meaning.total}
            </dd>
          </>
        )}
        {ev.supported.total > 0 && (
          <>
            <dt>עם עזרה לפני התשובה</dt>
            <dd>
              {ev.supported.ok} מתוך {ev.supported.total}
            </dd>
          </>
        )}
        <dt>5 ההזדמנויות האחרונות</dt>
        <dd>
          <span className="meter" aria-label={`${ev.window.ok} הצלחות מתוך ${ev.window.size}`}>
            {windowFilled.map((on, i) => (
              <span key={i} className={on ? 'on' : ''} />
            ))}
          </span>
        </dd>
        <dt>בדיקה לאחר מרווח</dt>
        <dd>{last ? `${last.ok ? 'הצליח' : 'לא הצליח'} ${formatInterval(last.hours)}` : 'טרם'}</dd>
        {ev.errors[0] && (
          <>
            <dt>טעות שחזרה ({ev.errors[0].count})</dt>
            <dd>
              {errorLabel(ev.errors[0].err) ?? (
                <span className="en" lang="en" dir="ltr">
                  {ev.errors[0].example}
                </span>
              )}
            </dd>
          </>
        )}
      </dl>
      {Object.keys(ev.byType).length > 1 && (
        <p className="faint">
          {Object.entries(ev.byType)
            .map(([t, v]) => `${TYPE_HE[t as TaskType]} ${v.ok}/${v.total}`)
            .join(' · ')}
        </p>
      )}
    </li>
  );
}
