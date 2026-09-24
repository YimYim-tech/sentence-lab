import { useState, type ReactNode } from 'react';
import type { HelpKind } from '../../engine/types';
import { Chain, En, RichText } from '../../ui/RichText';
import { IconBulb, IconClose, IconCompare, IconExample, IconMore, IconTranslate, IconWhy } from '../../ui/icons';
import { AudioButton } from '../../ui/AudioButton';
import type { TaskInfo } from './taskInfo';
import { EnglishExplanation, LanguageToggle } from './Lesson';

export const HELP_LABEL: Record<HelpKind, string> = {
  hint: 'רמז',
  why: 'למה?',
  difference: 'מה ההבדל?',
  example: 'דוגמה נוספת',
  translation: 'תרגום',
};

export function HelpRow({
  info,
  open,
  onOpen,
  onMore,
}: {
  info: TaskInfo;
  open: HelpKind | null;
  onOpen: (k: HelpKind) => void;
  onMore: () => void;
}) {
  return (
    <div className="help-row" role="toolbar" aria-label="עזרה">
      <button type="button" className="chip-btn" aria-pressed={open === 'hint'} onClick={() => onOpen('hint')}>
        <IconBulb />
        {HELP_LABEL.hint}
      </button>
      <button type="button" className="chip-btn" aria-pressed={open === 'why'} onClick={() => onOpen('why')}>
        <IconWhy />
        {HELP_LABEL.why}
      </button>
      {info.translation && (
        <button
          type="button"
          className="chip-btn"
          aria-pressed={open === 'translation'}
          onClick={() => onOpen('translation')}
        >
          <IconTranslate />
          {HELP_LABEL.translation}
        </button>
      )}
      <button type="button" className="chip-btn" onClick={onMore} aria-haspopup="dialog">
        <IconMore />
        עוד
      </button>
    </div>
  );
}

export function HelpPanel({
  kind,
  info,
  submitted,
  onClose,
}: {
  kind: HelpKind;
  info: TaskInfo;
  submitted: boolean;
  onClose: () => void;
}) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [english, setEnglish] = useState(false);
  let body: ReactNode;
  switch (kind) {
    case 'hint':
      body = <RichText text={info.hint} />;
      break;
    case 'why':
      body = english ? (
        <EnglishExplanation unit={info.unit} />
      ) : submitted ? (
        <div className="stack-tight">
          <RichText text={info.explain} />
          {info.deep && <RichText text={info.deep} className="small" />}
        </div>
      ) : info.lesson ? (
        <div className="stack-tight">
          <RichText text={info.lesson.short} />
          {info.lesson.chain && <Chain links={info.lesson.chain} />}
        </div>
      ) : (
        <RichText text={info.hint} />
      );
      break;
    case 'difference':
      body = info.diff ? (
        <RichText text={info.diff} />
      ) : info.lesson?.contrast ? (
        <div className="stack-tight">
          <div>
            <En className="example-en">{info.lesson.contrast.a.en}</En>
            <div className="muted small">{info.lesson.contrast.a.he}</div>
          </div>
          <div>
            <En className="example-en">{info.lesson.contrast.b.en}</En>
            <div className="muted small">{info.lesson.contrast.b.he}</div>
          </div>
          <RichText text={info.lesson.contrast.note} className="small" />
        </div>
      ) : (
        <p className="muted">לתרגיל הזה אין השוואה מיוחדת. אפשר לפתוח את "למה?".</p>
      );
      break;
    case 'example': {
      const list = info.examples;
      const ex = list.length ? list[exampleIndex % list.length] : undefined;
      body = ex ? (
        <div className="stack-tight">
          <div className="row-between">
            <En className="example-en">{ex.en}</En>
            <AudioButton text={ex.en} />
          </div>
          <span className="muted">{ex.he}</span>
          {ex.note && <RichText text={ex.note} className="small" />}
          {list.length > 1 && (
            <button type="button" className="btn btn-quiet" onClick={() => setExampleIndex((i) => i + 1)}>
              עוד דוגמה
            </button>
          )}
        </div>
      ) : (
        <p className="muted">אין כרגע דוגמה נוספת לנושא הזה.</p>
      );
      break;
    }
    case 'translation':
      body = <p>{info.translation}</p>;
      break;
  }
  const icon = { hint: IconBulb, why: IconWhy, difference: IconCompare, example: IconExample, translation: IconTranslate }[kind];
  const Icon = icon;
  return (
    <section className="help-panel" aria-live="polite" aria-label={HELP_LABEL[kind]}>
      <div className="help-head">
        <h3 className="row">
          <Icon width={18} height={18} />
          {HELP_LABEL[kind]}
        </h3>
        <div className="row">
          {kind === 'why' && <LanguageToggle english={english} onChange={setEnglish} />}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="סגור את העזרה">
            <IconClose />
          </button>
        </div>
      </div>
      {body}
    </section>
  );
}
