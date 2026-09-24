import { useState } from 'react';
import type { UnitId } from '../content/schema';
import { UNIT_BY_ID } from '../content/units';
import { CONFIG, type SegmentSize } from '../engine/config';
import { isDue } from '../engine/schedule';
import { chooseFocus, REASON_HE } from '../engine/select';
import { endSegmentEarly, startSegment } from '../engine/session';
import { formatDue } from '../engine/time';
import { navigate } from '../app/nav';
import { clockNow, useApp } from '../app/store';
import { RichText } from '../ui/RichText';
import { IconGear, IconOffline } from '../ui/icons';
import { StorageBanner } from './common';
import { VoiceCard } from './VoiceCard';

const SIZE_LABEL: Record<SegmentSize, string> = { short: 'קצר', regular: 'רגיל', deep: 'מעמיק' };

export function Masthead() {
  return (
    <header className="masthead">
      <div className="brand">
        <span className="brand-name" lang="en" dir="ltr">
          Sentence Lab
        </span>
        <span className="brand-sub">אנגלית שנבנית נכון</span>
      </div>
      <a className="icon-btn" href="#settings" aria-label="הגדרות, גיבוי ועזרה">
        <IconGear />
      </a>
    </header>
  );
}

export function Today() {
  const { snap, run, offlineReady, storage } = useApp();
  const [size, setSize] = useState<SegmentSize>(snap.settings.defaultSize);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const now = clockNow();
  const seg = snap.active;
  const inProgress = seg && seg.phase !== 'summary';

  const start = () => {
    run((s, e) => startSegment(s, e, size));
    navigate('practice');
  };

  const [voiceOpen, setVoiceOpen] = useState(false);
  const first = !snap.profile.firstSegmentDone;
  const focus = first ? { unit: 'S03' as UnitId, reason: 'first_segment' as const } : chooseFocus(snap);
  const meta = UNIT_BY_ID[focus.unit];
  const dueUnits = Object.values(snap.units)
    .filter((u) => u.unit !== focus.unit && isDue(u, now))
    .map((u) => u.unit);
  const upcoming = Object.values(snap.units)
    .filter((u) => u.step >= 0 && u.dueAt !== null && !isDue(u, now))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
    .slice(0, 3);

  return (
    <main className="screen" aria-label="היום">
      <Masthead />
      <StorageBanner />

      {inProgress && seg ? (
        <section className="hero-card" aria-label="המשך">
          <span className="kicker">המשך מהנקודה האחרונה</span>
          <h2>
            {seg.kind === 'calibration'
              ? 'בדיקת הכיול'
              : seg.focusUnit
                ? UNIT_BY_ID[seg.focusUnit].nameHe
                : 'המקטע הנוכחי'}
          </h2>
          <p className="reason num">
            משימה {Math.min(seg.index + 1, seg.slots.length)} מתוך {seg.slots.length}. הכול שמור בדיוק איפה שעצרת.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-big btn-block"
            onClick={() => navigate('practice')}
          >
            המשך
          </button>
          {confirmEnd ? (
            <div className="stack-tight">
              <p className="small">לסיים את המקטע עכשיו? מה שכבר ענית נשמר, ויוצג סיכום.</p>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    run(endSegmentEarly);
                    navigate('practice');
                  }}
                >
                  כן, סיים והצג סיכום
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmEnd(false)}>
                  לא עכשיו
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmEnd(true)}>
              סיים את המקטע כאן
            </button>
          )}
        </section>
      ) : seg && seg.phase === 'summary' ? (
        <section className="hero-card">
          <span className="kicker">המקטע הסתיים</span>
          <h2>הסיכום מחכה לך</h2>
          <button type="button" className="btn btn-primary btn-big btn-block" onClick={() => navigate('practice')}>
            לסיכום
          </button>
        </section>
      ) : (
        <section className="hero-card" aria-label="התרגול המומלץ">
          <div className="row-between">
            <span className="kicker">{first ? 'המקטע הראשון' : 'התרגול המומלץ'}</span>
            <span className={`tag${meta.prior === 'taught' ? '' : ' accent'}`}>
              {meta.prior === 'taught' ? 'העמקה' : 'חדש'}
            </span>
          </div>
          <div className="stack-tight">
            <h2>{meta.nameHe}</h2>
            <span className="unit-label">{meta.labelEn}</span>
          </div>
          <RichText text={meta.whyHe} className="reason" />
          {!first && focus.reason === 'focus_new' && <p className="faint">{REASON_HE.focus_new}: הקודם הגיע לשלב הבא.</p>}
          {dueUnits.length > 0 && (
            <p className="small">
              ובפתיחה {dueUnits.length === 1 ? 'חזרה קצרה' : 'חזרות קצרות'} על:{' '}
              {dueUnits.slice(0, CONFIG.reviewUnitsAtOpening).map((u) => UNIT_BY_ID[u].nameHe).join(', ')}
            </p>
          )}
          <div className="stack-tight">
            <span className="section-title">היקף</span>
            <div className="segmented" role="group" aria-label="היקף המקטע">
              {(Object.keys(SIZE_LABEL) as SegmentSize[]).map((k) => (
                <button key={k} type="button" aria-pressed={size === k} onClick={() => setSize(k)}>
                  <span>{SIZE_LABEL[k]}</span>
                  <span className="seg-sub num">{CONFIG.segmentSizes[k]} משימות</span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-big btn-block" onClick={start}>
            התחל
          </button>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="panel" aria-label="חזרות קרובות">
          <h2 className="section-title">חזרות מתוזמנות</h2>
          <ul className="list-plain">
            {upcoming.map((u) => (
              <li key={u.unit}>
                <span>{UNIT_BY_ID[u.unit].nameHe}</span>
                <span className="faint">{u.dueAt ? formatDue(u.dueAt, now) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel stack-tight" style={{ border: '1.5px dashed var(--accent)', background: 'var(--tray)' }}>
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
          <span>🎙️</span> אימון שיחה קולי ב-Gemini
        </h3>
        <p className="small muted" style={{ margin: 0 }}>
          רוצה לתרגל את מה שלמדת בשיחה חיה? צור כרטיס שיעור אישי (הכולל את הטעויות שלך) להדבקה במצב קולי בג'מיני.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setVoiceOpen(true)}
          style={{ marginTop: '0.3rem' }}
        >
          צור כרטיס שיעור קולי לג'מיני
        </button>
      </section>

      {voiceOpen && <VoiceCard onClose={() => setVoiceOpen(false)} />}

      <p className="faint row">
        <IconOffline width={16} height={16} />
        {storage === 'memory'
          ? 'תצוגת ניסיון: ההתקדמות לא נשמרת.'
          : offlineReady
            ? 'זמין ללא רשת במכשיר הזה.'
            : __SINGLE__
              ? 'ההתקדמות נשמרת בדפדפן הזה.'
              : 'עבודה ללא רשת תהיה זמינה אחרי הטעינה הראשונה.'}
      </p>
    </main>
  );
}
