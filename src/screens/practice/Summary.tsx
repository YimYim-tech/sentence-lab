import type { UnitId } from '../../content/schema';
import { UNIT_BY_ID } from '../../content/units';
import { isFailure } from '../../engine/evaluate';
import type { Profile, SegmentSummary } from '../../engine/types';
import { formatDue } from '../../engine/time';
import { En } from '../../ui/RichText';

const unitName = (u: UnitId) => UNIT_BY_ID[u]?.nameHe ?? u;

export function SummaryView({
  summary,
  profile,
  now,
  onRate,
}: {
  summary: SegmentSummary;
  profile: Profile;
  now: number;
  onRate: (r: 'too_easy' | 'fits' | 'too_hard') => void;
}) {
  if (summary.kind === 'calibration') return <CalibrationSummary profile={profile} />;
  const okTotal = summary.firstTry.reduce((n, f) => n + f.ok, 0);
  return (
    <section className="stack" aria-label="סיכום המקטע">
      <header className="stack-tight">
        <span className="section-title">{summary.completed ? 'סיכום המקטע' : 'עצרנו כאן'}</span>
        <h1 className="screen-title">
          {summary.completed ? `${summary.tasksDone} משימות` : `${summary.tasksDone} מתוך ${summary.tasksPlanned} משימות`}
        </h1>
        {summary.endedEarlyReason === 'content_exhausted' && (
          <p className="muted small">נגמרו התרגילים החדשים שמתאימים לרגע הזה, אז המקטע הסתיים מוקדם. לא נמלא אותו בחזרות ריקות.</p>
        )}
      </header>

      <div className="panel">
        <h2 className="section-title">מה תרגלנו</h2>
        <ul className="summary-list">
          {summary.practiced.map((p) => (
            <li key={p.unit}>
              <span>{unitName(p.unit)}</span>
              <span className="faint num">{p.count} משימות</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2 className="section-title">מה הצלחת בלי רמז נוסף</h2>
        {okTotal === 0 ? (
          <p className="muted small">הפעם עוד לא. זה מקטע של למידה — הבדיקה העצמאית תבוא בהמשך.</p>
        ) : (
          <ul className="summary-list">
            {summary.firstTry
              .filter((f) => f.total > 0)
              .map((f) => (
                <li key={f.unit}>
                  <span className="stack-tight">
                    <span>{unitName(f.unit)}</span>
                    {f.example && <En className="small muted">{f.example}</En>}
                  </span>
                  <span className="num">
                    {f.ok} מתוך {f.total}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {summary.toCheck.length > 0 && (
        <div className="panel">
          <h2 className="section-title">מה עוד נבדוק</h2>
          <ul className="summary-list">
            {summary.toCheck.map((c) => (
              <li key={`${c.unit}-${c.why}`}>
                <span>{unitName(c.unit)}</span>
                <span className="faint">
                  {c.why === 'errors' ? 'בודקים שוב במקטע הבא' : c.dueAt ? `חזרה ${formatDue(c.dueAt, now)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.askDifficulty && (
        <div className="panel stack-tight">
          <h2 className="section-title">איך הייתה רמת הקושי לאחרונה?</h2>
          <div className="segmented" role="group" aria-label="רמת קושי">
            {(
              [
                ['too_easy', 'קל מדי'],
                ['fits', 'מתאים'],
                ['too_hard', 'קשה מדי'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={summary.difficulty === k} onClick={() => onRate(k)}>
                {label}
              </button>
            ))}
          </div>
          <p className="faint">ההתאמה נשענת גם על התשובות שלך, לא רק על התחושה.</p>
        </div>
      )}
    </section>
  );
}

function CalibrationSummary({ profile }: { profile: Profile }) {
  const entries = Object.entries(profile.calibrationResults) as [UnitId, NonNullable<Profile['calibrationResults'][UnitId]>][];
  return (
    <section className="stack" aria-label="סיכום הכיול">
      <header className="stack-tight">
        <span className="section-title">סיכום הכיול</span>
        <h1 className="screen-title">נקודת ההתחלה שלך</h1>
      </header>
      <div className="panel">
        <ul className="summary-list">
          {entries.map(([u, o]) => (
            <li key={u}>
              <span>{unitName(u)}</span>
              <span className="faint">{isFailure(o) ? 'יש מה לחזק' : o === 'unverified' ? 'לא נבדק' : 'בלי שגיאה'}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted">
        זה לא ציון רמה. המידע רק מכוון את סדר התרגול: נתחיל ממבנה הפועל <En>have been + -ing</En> ומשאלות "כמה זמן",
        ונשלב חזרות קצרות על מה שדורש חיזוק.
      </p>
    </section>
  );
}
