import { useEffect, useMemo, useState } from 'react';
import type { Token } from '../../content/schema';
import {
  answerTokens,
  bankTokens,
  canUndo,
  caretPos,
  insertToken,
  isUnchanged,
  removeAt,
  resetBuild,
  setCaret,
  undoBuild,
  type BuildView,
} from '../../engine/builder';
import { getQuickChoices, type QuickChoice } from '../../engine/quickChoice';
import type { BuildState } from '../../engine/types';
import { IconCheck, IconUndo } from '../../ui/icons';
import { vibrateTap } from '../../ui/haptics';
import { playTapSound } from '../../ui/sound';

function displayText(t: Token, first: boolean): string {
  if (!first) return t.t;
  return t.t.charAt(0).toUpperCase() + t.t.slice(1);
}

function matchesChoice(answer: readonly string[], choice: QuickChoice): boolean {
  if (answer.length !== choice.tokenIds.length) return false;
  return choice.tokenIds.every((id, idx) => answer[idx] === id);
}

export function Builder({
  view,
  build,
  onChange,
  readOnly = false,
  thinkFirst = false,
}: {
  view: BuildView;
  build: BuildState;
  onChange: (b: BuildState) => void;
  readOnly?: boolean;
  thinkFirst?: boolean;
}) {
  const quickChoices = useMemo(() => getQuickChoices(view, build.seed ?? 0), [view, build.seed]);
  const [mode, setMode] = useState<'quick' | 'puzzle'>(() => {
    if (!quickChoices) return 'puzzle';
    if (build.answer.length > 0) {
      const matchesAny = quickChoices.some((c) => matchesChoice(build.answer, c));
      if (!matchesAny) return 'puzzle';
    }
    return 'quick';
  });
  const [bankOpen, setBankOpen] = useState(!thinkFirst || build.answer.length > 0);

  const placed = answerTokens(view, build);
  const bank = bankTokens(view, build);
  const caret = caretPos(build);
  const lead = view.spec.lead;
  const hasSource = view.source.length > 0;

  // Keyboard navigation on desktop / iPad with hardware keyboard
  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (mode === 'quick' && quickChoices && quickChoices.length >= 2) {
        if (e.key === '1' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          playTapSound();
          vibrateTap();
          const first = quickChoices[0];
          if (first) {
            onChange({ ...build, answer: first.tokenIds, caret: null });
          }
        } else if (e.key === '2' || e.key === 'b' || e.key === 'B') {
          const second = quickChoices[1];
          if (second) {
            e.preventDefault();
            playTapSound();
            vibrateTap();
            onChange({ ...build, answer: second.tokenIds, caret: null });
          }
        }
        return;
      }
      if (e.key === 'Backspace') {
        if (canUndo(build)) {
          e.preventDefault();
          playTapSound();
          vibrateTap();
          onChange(undoBuild(build));
        } else if (build.answer.length > 0) {
          e.preventDefault();
          playTapSound();
          vibrateTap();
          onChange(removeAt(build, build.answer.length - 1));
        }
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (bank[idx]) {
          e.preventDefault();
          playTapSound();
          vibrateTap();
          onChange(insertToken(build, bank[idx].id));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readOnly, mode, quickChoices, build, bank, onChange]);

  // If in quick choice mode (and not readOnly), show the 2 Duolingo-style 3D cards
  if (!readOnly && mode === 'quick' && quickChoices) {
    return (
      <div className="builder-quick" aria-label="בחירת המשפט הנכון">
        {/* Hidden sentence line for accessibility and e2e testing */}
        <div className="line sr-only" dir="ltr" aria-hidden="true">
          {lead && <span className="lead">{lead}</span>}
          {placed.map((t, idx) => (
            <span key={t.id} className="tile">{displayText(t, idx === 0 && !lead)}</span>
          ))}
        </div>

        {lead && (
          <div className="quick-lead-box" lang="en" dir="ltr">
            <span className="quick-lead-label">תחילת המשפט:</span>
            <span className="quick-lead-text">{lead}</span>
          </div>
        )}

        <div className="quick-choices-grid" role="radiogroup" aria-label="בחר משפט">
          {quickChoices.map((choice, idx) => {
            const letter = idx === 0 ? 'A' : 'B';
            // In a correction task, don't show the initial source sentence as pre-selected
            const isUnchangedSource = hasSource && isUnchanged(view, build);
            const selected = !isUnchangedSource && matchesChoice(build.answer, choice);

            return (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`quick-choice-card ${selected ? 'selected' : ''}`}
                onClick={() => {
                  playTapSound();
                  vibrateTap();
                  onChange({
                    ...build,
                    answer: choice.tokenIds,
                    caret: null,
                  });
                }}
              >
                <span className="quick-choice-badge">{letter}</span>
                <span className="quick-choice-text" lang="en" dir="ltr">
                  {choice.text}
                  {view.spec.end}
                </span>
                <span className="quick-choice-mark">
                  {selected && <IconCheck />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="quick-mode-switch">
          <button
            type="button"
            className="btn-mode-toggle"
            onClick={() => {
              playTapSound();
              vibrateTap();
              setMode('puzzle');
              setBankOpen(true);
            }}
          >
            🧩 מעדיף להרכיב מילה במילה? לחץ כאן
          </button>
        </div>
      </div>
    );
  }

  // Word-by-word puzzle mode / ReadOnly mode
  const gap = (pos: number, end = false) => (
    <button
      key={`g${pos}`}
      type="button"
      className={`gap${end ? ' end' : ''}`}
      aria-pressed={caret === pos}
      aria-label={end ? 'הוסף בסוף המשפט' : pos === 0 ? 'הוסף בתחילת המשפט' : `הוסף אחרי המילה ${pos}`}
      onClick={() => {
        if (!readOnly) {
          playTapSound();
          vibrateTap();
          onChange(setCaret(build, pos));
        }
      }}
      disabled={readOnly}
    />
  );

  return (
    <div className="builder">
      {quickChoices && !readOnly && (
        <div className="quick-mode-switch top">
          <button
            type="button"
            className="btn-mode-toggle active-hint"
            onClick={() => {
              playTapSound();
              vibrateTap();
              setMode('quick');
            }}
          >
            ⚡ חזור לבחירה ממוקדת (2 אפשרויות)
          </button>
        </div>
      )}

      <div className="tray" aria-label="המשפט שלך">
        <div className="line" lang="en" dir="ltr">
          {lead && <span className="lead">{lead}</span>}
          {placed.length === 0 && !readOnly && (
            <span className="placeholder" dir="rtl" lang="he">
              גע במילים למטה כדי לבנות את המשפט
            </span>
          )}
          {placed.map((t, i) => [
            gap(i),
            <button
              key={t.id}
              type="button"
              className="tile"
              onClick={() => {
                if (!readOnly) {
                  playTapSound();
                  vibrateTap();
                  onChange(removeAt(build, i));
                }
              }}
              aria-label={`${displayText(t, i === 0 && !lead)} — הסר מהמשפט`}
              disabled={readOnly}
            >
              {displayText(t, i === 0 && !lead)}
            </button>,
          ])}
          {placed.length > 0 && <span className="end-punct">{view.spec.end}</span>}
          {gap(placed.length, true)}
        </div>
      </div>

      {!readOnly && (
        <>
          <div className="builder-tools">
            <span className="faint" aria-live="polite">
              {caret < placed.length ? 'המילה הבאה תיכנס במקום המסומן' : ' '}
            </span>
            <div className="row" style={{ gap: '6px' }}>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  playTapSound();
                  vibrateTap();
                  onChange(undoBuild(build));
                }}
                disabled={!canUndo(build)}
                title="בטל פעולה אחרונה (Backspace)"
              >
                <IconUndo />
                בטל
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  playTapSound();
                  vibrateTap();
                  onChange(resetBuild(view, build));
                }}
                disabled={hasSource ? isUnchanged(view, build) : placed.length === 0}
              >
                {hasSource ? 'חזור למקור' : 'נקה הכול'}
              </button>
            </div>
          </div>
          {bankOpen ? (
            <div className="bank" aria-label="מילים לבחירה">
              {bank.length === 0 && (
                <span className="bank-empty" dir="rtl" lang="he">
                  כל המילים במשפט
                </span>
              )}
              {bank.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tile"
                  onClick={() => {
                    playTapSound();
                    vibrateTap();
                    onChange(insertToken(build, t.id));
                  }}
                  aria-label={`${t.t} — הוסף למשפט`}
                >
                  {t.t}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="bank-cover" onClick={() => setBankOpen(true)}>
              נסח את המשפט בראש — ואז גע כדי לראות את המילים
            </button>
          )}
        </>
      )}
    </div>
  );
}
