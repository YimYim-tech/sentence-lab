import { useEffect, useRef, useState } from 'react';
import { LESSONS } from '../../content';
import type { DiscriminateItem } from '../../content/schema';
import { UNIT_BY_ID } from '../../content/units';
import { buildView, initialBuild, isUnchanged } from '../../engine/builder';
import { isFailure } from '../../engine/evaluate';
import { hashString } from '../../engine/rng';
import { REASON_HE, ROLE_HE, turnUnit } from '../../engine/select';
import {
  canRepair,
  canSubmit,
  closeHelp,
  closeSummary,
  continueFlow,
  openHelp,
  pauseSegment,
  rateDifficulty,
  reportProblem,
  skipTask,
  startRepair,
  startSegment,
  submit,
  toggleDeep,
  toggleModel,
  updateBuild,
  updateChoice,
} from '../../engine/session';
import type { ActiveSegment, CurrentTask, HelpKind, ReportReason } from '../../engine/types';
import { navigate } from '../../app/nav';
import { useApp } from '../../app/store';
import { Chain, En, RichText } from '../../ui/RichText';
import { IconFlag, IconPause, IconSkip, IconCompare, IconExample, IconAlert } from '../../ui/icons';
import { Builder } from './Builder';
import { Choices } from './Choices';
import { Feedback } from './Feedback';
import { HelpPanel, HelpRow } from './Help';
import { LessonView } from './Lesson';
import { SummaryView } from './Summary';
import { VoiceCard } from '../VoiceCard';
import { taskInfo, type TaskInfo } from './taskInfo';

export function Practice() {
  const { snap, run, save, updateReady, applyUpdate } = useApp();
  const seg = snap.active;
  const topRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<null | 'more' | 'report'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const slotKey = seg ? `${seg.segmentId}:${seg.index}:${seg.phase === 'explain' ? 'x' : ''}${seg.current?.attemptNo ?? ''}` : '';
  useEffect(() => {
    window.scrollTo({ top: 0 });
    topRef.current?.focus({ preventScroll: true });
    setSheet(null);
  }, [slotKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!seg) navigate('today');
  }, [seg]);
  if (!seg) return null;

  const cur = seg.current;
  const info = cur ? taskInfo(seg, cur) : null;
  const midAnswer =
    (seg.phase === 'task' || seg.phase === 'repair') &&
    Boolean(cur && ((cur.build && !isUnchangedBuild(cur)) || (cur.choice?.length ?? 0) > 0));

  const pause = () => {
    run(pauseSegment);
    navigate('today');
  };

  return (
    <main
      className="screen practice"
      aria-label="תרגול"
      data-phase={seg.phase}
      data-item={cur?.item.id ?? ''}
      data-turn={cur?.turn ?? ''}
    >
      <PracticeBar seg={seg} save={save} onPause={pause} />
      <div ref={topRef} tabIndex={-1} className="sr-only">
        {seg.phase === 'explain' ? 'הסבר' : seg.phase === 'summary' ? 'סיכום' : 'משימה חדשה'}
      </div>

      {updateReady && !midAnswer && (
        <div className="banner info" role="status">
          <IconAlert />
          <div>
            גרסה חדשה של האפליקציה מוכנה. ההתקדמות שמורה, והעדכון ימשיך מאותה נקודה.
            <div className="banner-actions">
              <button type="button" className="btn btn-secondary" onClick={applyUpdate}>
                עדכן עכשיו
              </button>
            </div>
          </div>
        </div>
      )}

      {seg.phase === 'explain' && seg.explainUnit && (
        <ExplainPhase seg={seg} onContinue={() => run(continueFlow)} />
      )}

      {cur && info && (seg.phase === 'task' || seg.phase === 'repair' || seg.phase === 'feedback') && (
        <TaskPhase
          seg={seg}
          task={cur}
          info={info}
          onMore={() => setSheet('more')}
          onReport={() => setSheet('report')}
        />
      )}

      {seg.phase === 'summary' && seg.summary && (
        <>
          <SummaryView
            summary={seg.summary}
            profile={snap.profile}
            now={Date.now()}
            onRate={(r) => run((s, e) => rateDifficulty(s, e, r))}
          />
          <div className="dock">
            <div className="dock-inner">
              <button
                type="button"
                className="btn btn-primary btn-big btn-block"
                onClick={() => {
                  run(closeSummary);
                  run((s, e) => startSegment(s, e, s.settings.defaultSize));
                }}
              >
                {seg.summary.kind === 'calibration' ? 'התחל את המקטע הראשון' : 'המשך למקטע הבא'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => setVoiceOpen(true)}
              >
                🎙️ כרטיס שיעור קולי לג'מיני
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-block"
                onClick={() => {
                  run(closeSummary);
                  navigate('today');
                }}
              >
                סיים להיום
              </button>
            </div>
          </div>
          {voiceOpen && <VoiceCard onClose={() => setVoiceOpen(false)} />}
        </>
      )}

      {toast && (
        <div className="banner info" role="status">
          <IconFlag />
          <div>{toast}</div>
        </div>
      )}

      {sheet === 'more' && cur && info && (
        <MoreSheet
          task={cur}
          phase={seg.phase}
          onClose={() => setSheet(null)}
          onHelp={(k) => {
            setSheet(null);
            run((s, e) => openHelp(s, e, k));
          }}
          onSkip={() => {
            setSheet(null);
            run(skipTask);
          }}
          onReport={() => setSheet('report')}
        />
      )}
      {sheet === 'report' && cur && (
        <ReportSheet
          onClose={() => setSheet(null)}
          onPick={(r) => {
            setSheet(null);
            const before = seg.phase;
            run((s, e) => reportProblem(s, e, r));
            setToast(
              before === 'task'
                ? 'הדיווח נשמר. עברנו לתרגיל הבא, והתרגיל הזה לא נספר.'
                : 'הדיווח נשמר. הניסיון הזה לא ייספר בהתקדמות עד שהשאלה תיבדק.',
            );
          }}
        />
      )}
    </main>
  );
}

function isUnchangedBuild(cur: CurrentTask): boolean {
  const view = buildView(cur.item, cur.turn);
  if (!view || !cur.build) return true;
  return isUnchanged(view, cur.build);
}

/* ----------------------------------------------------------------- top bar */

function PracticeBar({ seg, save, onPause }: { seg: ActiveSegment; save: string; onPause: () => void }) {
  const slot = seg.slots[seg.index];
  const total = seg.slots.filter((s) => !(s.status === 'skipped' && s.reason === 'content_exhausted')).length;
  const position = Math.min(seg.slots.slice(0, seg.index + 1).filter((s) => s.reason !== 'content_exhausted').length, total);
  const unit = seg.phase === 'explain' ? seg.explainUnit : slot?.unit ?? null;
  const roleText =
    seg.phase === 'explain'
      ? 'הסבר קצר'
      : seg.phase === 'summary'
        ? 'סיכום'
        : slot
          ? slot.familiar
            ? `${ROLE_HE[slot.role]} · חזרה מוכרת`
            : slot.reason === 'recheck_after_error' || slot.reason === 'bridge_need' || slot.reason === 'probe_prior'
              ? `${ROLE_HE[slot.role]} · ${REASON_HE[slot.reason]}`
              : ROLE_HE[slot.role]
          : '';
  const done = seg.slots.filter((s) => s.status === 'done' || (s.status === 'skipped' && s.reason !== 'content_exhausted')).length;
  return (
    <div className="practice-bar">
      <button type="button" className="chip-btn" onClick={onPause} aria-label="עצור ושמור — אפשר להמשיך אחר כך">
        <IconPause />
        עצור
      </button>
      <div className="where">
        <div className="role">{roleText}</div>
        <div className="unit">
          {seg.phase === 'summary'
            ? seg.kind === 'calibration'
              ? 'כיול'
              : seg.focusUnit
                ? UNIT_BY_ID[seg.focusUnit].nameHe
                : ''
            : unit
              ? UNIT_BY_ID[unit].nameHe
              : seg.kind === 'calibration'
                ? 'כיול'
                : ''}
        </div>
      </div>
      <div className="stack-tight" style={{ alignItems: 'flex-end', gap: 0 }}>
        {seg.phase !== 'summary' && (
          <span className="count" dir="ltr">
            {position} / {total}
          </span>
        )}
        <span className={`save-state${save === 'error' ? ' err' : ''}`} aria-live="polite">
          {save === 'saving' ? 'שומר…' : save === 'saved' ? 'נשמר' : save === 'error' ? 'לא נשמר' : ''}
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ explain */

function ExplainPhase({ seg, onContinue }: { seg: ActiveSegment; onContinue: () => void }) {
  const unit = seg.explainUnit;
  const lesson = unit ? LESSONS.get(unit) : undefined;
  const meta = unit ? UNIT_BY_ID[unit] : undefined;
  const bridge = seg.reason === 'focus_new' ? meta?.bridgeHe : null;
  return (
    <>
      {lesson ? (
        <LessonView lesson={lesson} bridge={bridge ?? null} />
      ) : (
        <p className="muted">ההסבר לנושא הזה עוד לא זמין.</p>
      )}
      <div className="dock">
        <div className="dock-inner">
          <button type="button" className="btn btn-primary btn-big btn-block" onClick={onContinue}>
            המשך לתרגול
          </button>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- task */

function TaskPhase({
  seg,
  task,
  info,
  onMore,
  onReport,
}: {
  seg: ActiveSegment;
  task: CurrentTask;
  info: TaskInfo;
  onMore: () => void;
  onReport: () => void;
}) {
  const { run, snap } = useApp();
  const item = task.item;
  const view = buildView(item, task.turn);
  const phase = seg.phase;
  const answering = phase === 'task' || phase === 'repair';
  const showTranslation = task.help === 'translation';
  const choiceSeed = hashString(`${seg.segmentId}:${task.slotIndex}`);
  const firstTurn = (task.turn ?? 0) === 0;

  const doSubmit = () => run(submit);
  const noCorrection = () => {
    if (!view) return;
    run((s, e) => updateBuild(s, e, initialBuild(view, task.build?.seed ?? 1)));
    run(submit);
  };

  return (
    <>
      {item.type === 'dialogue' ? (
        <section className="dialogue" aria-label="דיאלוג">
          {firstTurn && <p className="scene">{item.setupHe}</p>}
          {info.transcript.map((l, i) => (
            <p key={i} className={`bubble ${l.who === 'me' ? 'me' : 'partner'}`} lang="en">
              <span className="who">{l.who === 'me' ? 'אתה' : info.partnerName}</span>
              {l.en}
            </p>
          ))}
          {info.partnerNow && (
            <p className="bubble partner" lang="en">
              <span className="who">{info.partnerName}</span>
              {info.partnerNow.en}
              {showTranslation && <span className="tr">{info.partnerNow.he}</span>}
            </p>
          )}
        </section>
      ) : (
        <div className="prompt-card">
          <div className="prompt-badge-row">
            <span className="prompt-goal-chip">{info.goal}</span>
            {item.stage === 1 && item.scaffold && item.role !== 'check' && answering && (
              <Chain links={item.scaffold} />
            )}
          </div>
          <h2 className="prompt-main">
            {item.sitHe ? (
              <RichText text={item.sitHe} />
            ) : item.promptHe ? (
              <span>{item.promptHe}</span>
            ) : (
              <RichText text={info.instr} />
            )}
          </h2>
          {item.type === 'transform' && (
            <p className="prompt-source" lang="en" dir="ltr">
              <span className="source-label">מקור:</span>{' '}
              {item.source.map((t) => t.t).join(' ').replace(/^./, (c) => c.toUpperCase())}
              {item.sourceEnd}
            </p>
          )}
          {item.sitEn && (
            <div className="stack-tight">
              <p className="prompt-en-sit" lang="en" dir="ltr">
                {item.sitEn}
              </p>
              {showTranslation && item.trHe && <p className="muted small">{item.trHe}</p>}
            </div>
          )}
        </div>
      )}

      {phase === 'repair' && (
        <div className="banner info">
          <IconAlert />
          <div className="stack-tight">
            <span>תקן את המשפט שלך. {task.modelVisible ? '' : 'אם צריך, אפשר להציץ שוב בתשובה.'}</span>
            {task.modelVisible && task.lastEval && (
              <p className="sentence model" lang="en" dir="ltr">
                {task.lastEval.model}
              </p>
            )}
            <div>
              <button type="button" className="btn btn-quiet" onClick={() => run(toggleModel)}>
                {task.modelVisible ? 'הסתר את התשובה' : 'הצג את התשובה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {answering && view && task.build && (
        <Builder
          key={`${seg.segmentId}:${task.slotIndex}:${task.attemptNo}`}
          view={view}
          build={task.build}
          onChange={(b) => run((s, e) => updateBuild(s, e, b))}
          thinkFirst={snap.settings.thinkFirst && phase === 'task'}
        />
      )}
      {answering && item.type === 'discriminate' && (
        <Choices
          item={item as DiscriminateItem}
          seed={choiceSeed}
          selected={task.choice ?? []}
          onChange={(ids) => run((s, e) => updateChoice(s, e, ids))}
        />
      )}

      {phase === 'feedback' && (
        <Feedback task={task} info={info} deepOpen={task.deepOpen} onToggleDeep={() => run(toggleDeep)} />
      )}

      {answering && (
        <HelpRow info={info} open={task.help} onOpen={(k) => run((s, e) => openHelp(s, e, k))} onMore={onMore} />
      )}
      {task.help && (
        <HelpPanel kind={task.help} info={info} submitted={phase === 'feedback'} onClose={() => run(closeHelp)} />
      )}

      {phase === 'feedback' && (
        <div className="row">
          <button type="button" className="btn btn-quiet" onClick={() => run((s, e) => openHelp(s, e, 'example'))}>
            <IconExample />
            דוגמה נוספת
          </button>
          <button type="button" className="btn btn-quiet" onClick={onReport}>
            <IconFlag />
            יש בעיה בשאלה
          </button>
        </div>
      )}

      <div className="dock">
        <div className="dock-inner">
          {answering && (
            <>
              <button
                type="button"
                className="btn btn-primary btn-big btn-block"
                onClick={doSubmit}
                disabled={!canSubmit(task)}
              >
                בדוק
              </button>
            </>
          )}
          {phase === 'feedback' && <FeedbackActions task={task} />}
        </div>
      </div>
    </>
  );
}

function FeedbackActions({ task }: { task: CurrentTask }) {
  const { run } = useApp();
  const ev = task.lastEval;
  const repairable = canRepair(task);
  const failure = ev ? isFailure(ev.outcome) : false;
  if (repairable && failure) {
    return (
      <div className="dock-row">
        <button type="button" className="btn btn-secondary" onClick={() => run(continueFlow)}>
          המשך בלי לתקן
        </button>
        <button type="button" className="btn btn-primary btn-big" onClick={() => run(startRepair)}>
          {task.attemptNo > 0 ? 'נסה שוב' : 'תקן את המשפט'}
        </button>
      </div>
    );
  }
  if (repairable && ev?.outcome === 'target_not_used') {
    return (
      <div className="dock-row">
        <button type="button" className="btn btn-secondary" onClick={() => run(startRepair)}>
          נסה עם המבנה
        </button>
        <button type="button" className="btn btn-primary btn-big" onClick={() => run(continueFlow)}>
          המשך
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="btn btn-primary btn-big btn-block" onClick={() => run(continueFlow)}>
      המשך
    </button>
  );
}

/* ------------------------------------------------------------------ sheets */

function MoreSheet({
  task,
  phase,
  onClose,
  onHelp,
  onSkip,
  onReport,
}: {
  task: CurrentTask;
  phase: ActiveSegment['phase'];
  onClose: () => void;
  onHelp: (k: HelpKind) => void;
  onSkip: () => void;
  onReport: () => void;
}) {
  const unit = turnUnit(task.item, task.turn);
  return (
    <div className="scrim" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="עוד אפשרויות" onClick={(e) => e.stopPropagation()}>
        <h2>עוד אפשרויות</h2>
        <p className="faint">{UNIT_BY_ID[unit].nameHe}</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary btn-block" onClick={() => onHelp('example')}>
            <IconExample />
            דוגמה נוספת
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => onHelp('difference')}>
            <IconCompare />
            מה ההבדל?
          </button>
          {phase === 'task' && (
            <button type="button" className="btn btn-secondary btn-block" onClick={onSkip}>
              <IconSkip />
              דלג על התרגיל
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={onReport}>
            <IconFlag />
            יש בעיה בשאלה
          </button>
          <button type="button" className="btn btn-quiet btn-block" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

const REPORT_REASONS: { r: ReportReason; label: string }[] = [
  { r: 'more_than_one', label: 'יש יותר מתשובה נכונה אחת' },
  { r: 'unclear', label: 'ההסבר לא ברור' },
  { r: 'seems_wrong', label: 'נראה שיש טעות' },
  { r: 'other', label: 'אחר' },
];

function ReportSheet({ onClose, onPick }: { onClose: () => void; onPick: (r: ReportReason) => void }) {
  return (
    <div className="scrim" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="דיווח על בעיה" onClick={(e) => e.stopPropagation()}>
        <h2>מה הבעיה בשאלה?</h2>
        <p className="faint">הניסיון בשאלה הזאת לא ייספר בהתקדמות עד שהיא תיבדק. הדיווח נשמר לייצוא מההגדרות.</p>
        <div className="sheet-actions">
          {REPORT_REASONS.map((x) => (
            <button key={x.r} type="button" className="btn btn-secondary btn-block" onClick={() => onPick(x.r)}>
              {x.label}
            </button>
          ))}
          <button type="button" className="btn btn-quiet btn-block" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
