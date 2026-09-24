import { useEffect, useRef } from 'react';
import type { DiscriminateItem } from '../../content/schema';
import { answerTokens, buildView } from '../../engine/builder';
import { displaySentence, isFailure } from '../../engine/evaluate';
import type { CurrentTask } from '../../engine/types';
import { Chain, En, RichText } from '../../ui/RichText';
import {
  IconCheckCircle,
  IconChevron,
  IconMinusCircle,
  IconQuestionCircle,
  IconXCircle,
} from '../../ui/icons';
import { AudioButton } from '../../ui/AudioButton';
import { vibrateError, vibrateSuccess } from '../../ui/haptics';
import { playErrorSound, playSuccessSound } from '../../ui/sound';
import { speakEnglish } from '../../ui/speech';
import type { TaskInfo } from './taskInfo';

interface Verdict {
  text: string;
  tone: 'v-ok' | 'v-alt' | 'v-neutral' | 'v-bad';
  icon: typeof IconCheckCircle;
}

export function verdictFor(task: CurrentTask): Verdict {
  const ev = task.lastEval;
  const repair = task.attemptNo > 0;
  switch (ev?.outcome) {
    case 'correct_target':
      return { text: repair ? 'תוקן' : 'נכון!', tone: 'v-ok', icon: IconCheckCircle };
    case 'valid_alternative':
      return { text: repair ? 'תוקן — בניסוח חלופי' : 'נכון — ניסוח חלופי', tone: 'v-alt', icon: IconCheckCircle };
    case 'target_not_used':
      return { text: 'תקין, אבל בלי המבנה שתרגלנו', tone: 'v-neutral', icon: IconMinusCircle };
    case 'meaning_mismatch':
      return { text: repair ? 'עדיין לא מתאים לסיטואציה' : 'תקין דקדוקית, אבל לא מתאים לסיטואציה', tone: 'v-bad', icon: IconXCircle };
    case 'form_error':
      return { text: repair ? 'עדיין לא' : 'לא בדיוק', tone: 'v-bad', icon: IconXCircle };
    case 'unverified':
      return { text: 'לא ניתן לאמת אוטומטית', tone: 'v-neutral', icon: IconQuestionCircle };
    default:
      return { text: '', tone: 'v-neutral', icon: IconQuestionCircle };
  }
}

function yourSentence(task: CurrentTask): string | null {
  const view = buildView(task.item, task.turn);
  if (!view || !task.lastAnswer) return null;
  const tokens = answerTokens(view, { answer: task.lastAnswer, caret: null, sticky: false, seed: 0 });
  return displaySentence(tokens.map((t) => t.t).join(' '), view.spec.end, view.spec.lead);
}

export function Feedback({
  task,
  info,
  deepOpen,
  onToggleDeep,
}: {
  task: CurrentTask;
  info: TaskInfo;
  deepOpen: boolean;
  onToggleDeep: () => void;
}) {
  const ev = task.lastEval;
  if (!ev) return null;
  const v = verdictFor(task);
  const Icon = v.icon;
  const bad = isFailure(ev.outcome);
  const yours = yourSentence(task);
  const isChoice = task.item.type === 'discriminate';

  const playedRef = useRef<string | null>(null);
  const evalKey = `${task.slotIndex}:${task.attemptNo}:${ev.outcome}`;

  useEffect(() => {
    if (playedRef.current === evalKey) return;
    playedRef.current = evalKey;

    if (!bad) {
      playSuccessSound();
      vibrateSuccess();
      const sentenceToSpeak = yours || ev.model;
      if (sentenceToSpeak) {
        const timer = setTimeout(() => {
          speakEnglish(sentenceToSpeak);
        }, 320);
        return () => clearTimeout(timer);
      }
    } else {
      playErrorSound();
      vibrateError();
    }
  }, [evalKey, bad, yours, ev.model]);

  let modelLabel: string | null = null;
  if (!isChoice) {
    if (bad) modelLabel = 'המשפט המתוקן';
    else if (ev.outcome === 'valid_alternative') modelLabel = 'הניסוח שתרגלנו';
    else if (ev.outcome === 'target_not_used') modelLabel = 'עם המבנה שתרגלנו';
    else if (ev.outcome === 'unverified') modelLabel = 'משפט אפשרי';
  }
  const showModel = modelLabel !== null && ev.model && ev.model !== yours;

  return (
    <section className="feedback" aria-live="polite" aria-label="משוב">
      <div className={`verdict ${v.tone}`}>
        <Icon />
        <span>{v.text}</span>
      </div>

      {!isChoice && yours && (
        <div className="sentence-block">
          <div className="row-between">
            <span className="label">המשפט שלך</span>
            <AudioButton text={yours} />
          </div>
          <p className={`sentence yours${bad ? ' bad' : ''}`} lang="en" dir="ltr">
            {yours}
          </p>
        </div>
      )}

      {ev.feedback && <RichText text={ev.feedback} />}
      {ev.note && <RichText text={ev.note} />}

      {showModel && (
        <div className="sentence-block">
          <div className="row-between">
            <span className="label">{modelLabel}</span>
            <AudioButton text={ev.model} showSlowToggle />
          </div>
          <p className="sentence model" lang="en" dir="ltr">
            {ev.model}
          </p>
        </div>
      )}

      {task.attemptNo > 0 && ev.outcome === 'correct_target' && (
        <p className="faint">זה נרשם כתיקון בעזרת התשובה. הבדיקה העצמאית תגיע בהמשך, בהקשר אחר.</p>
      )}

      {task.demonstrated && (
        <div className="stack-tight">
          <span className="section-title">ככה נבנה המשפט</span>
          {info.lesson?.chain && <Chain links={info.lesson.chain} />}
          <RichText text={info.explain} />
          <p className="faint">ממשיכים הלאה — נחזור לזה בהמשך המקטע או בפעם הבאה.</p>
        </div>
      )}

      {isChoice && <OptionReview item={task.item as DiscriminateItem} selected={task.lastAnswer ?? []} />}

      {!task.demonstrated && (
        <div>
          <button type="button" className="expander" aria-expanded={deepOpen} onClick={onToggleDeep}>
            <IconChevron />
            {deepOpen ? 'פחות' : 'למה?'}
          </button>
          {deepOpen && (
            <div className="stack-tight">
              <RichText text={info.explain} />
              {info.deep && <RichText text={info.deep} className="small" />}
            </div>
          )}
        </div>
      )}

      {info.isLastTurn && info.closing && (ev.outcome === 'correct_target' || ev.outcome === 'valid_alternative' || task.demonstrated) && (
        <p className="bubble partner" lang="en">
          <span className="who">{info.partnerName}</span>
          {info.closing.en}
          <span className="tr">{info.closing.he}</span>
        </p>
      )}
    </section>
  );
}

function OptionReview({ item, selected }: { item: DiscriminateItem; selected: readonly string[] }) {
  return (
    <ul className="option-review">
      {item.options.map((o) => {
        const chosen = selected.includes(o.id);
        const Icon = o.v === 'fits' ? IconCheckCircle : chosen ? IconXCircle : IconMinusCircle;
        const tone = o.v === 'fits' ? 'ok' : chosen ? 'bad' : 'neutral';
        return (
          <li key={o.id}>
            <Icon className={`ico ${tone}`} />
            <div className="stack-tight" style={{ flex: 1 }}>
              <div className="row-between">
                <En className="sentence">{o.en}</En>
                <AudioButton text={o.en} />
              </div>
              <span className="small muted">
                {chosen ? 'בחרת · ' : ''}
                {o.v === 'fits' ? 'מתאים' : o.v === 'other_meaning' ? 'תקין, אבל אומר משהו אחר' : 'לא תקין'}
              </span>
              <RichText text={o.why} className="small" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
