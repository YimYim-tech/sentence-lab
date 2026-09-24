import type { ChoiceOption, DiscriminateItem } from '../../content/schema';
import { seededShuffle } from '../../engine/rng';
import { IconCheck } from '../../ui/icons';
import { vibrateTap } from '../../ui/haptics';
import { playTapSound } from '../../ui/sound';

export function orderedOptions(item: DiscriminateItem, seed: number): ChoiceOption[] {
  return seededShuffle(item.options, seed);
}

export function Choices({
  item,
  seed,
  selected,
  onChange,
  readOnly = false,
}: {
  item: DiscriminateItem;
  seed: number;
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
}) {
  const options = orderedOptions(item, seed);
  const toggle = (id: string) => {
    if (readOnly) return;
    playTapSound();
    vibrateTap();
    if (item.multi) {
      onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      onChange([id]);
    }
  };
  return (
    <div className="stack-tight">
      <p className="faint">{item.multi ? 'בחר את כל המשפטים שמתאימים (יכול להיות יותר מאחד).' : 'בחר את המשפט שמתאים.'}</p>
      <div className="choices" role={item.multi ? 'group' : 'radiogroup'} aria-label="אפשרויות">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={item.multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              className={`choice${item.multi ? ' multi' : ''}`}
              onClick={() => toggle(o.id)}
              disabled={readOnly}
              lang="en"
            >
              <span className="mark">{on && <IconCheck />}</span>
              <span>{o.en}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
