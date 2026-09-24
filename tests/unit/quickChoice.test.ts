import { describe, expect, it } from 'vitest';
import { CALIBRATION, PACKS } from '../../src/content/index';
import { buildView } from '../../src/engine/builder';
import { getQuickChoices } from '../../src/engine/quickChoice';

describe('quickChoice generator', () => {
  it('generates 2 distinct valid choices for calibration assemble item', () => {
    const item = CALIBRATION[0]!;
    const view = buildView(item, null)!;
    const choices = getQuickChoices(view, 0);

    expect(choices).not.toBeNull();
    expect(choices?.length).toBe(2);

    const [c1, c2] = choices!;
    expect(c1!.text).not.toEqual(c2!.text);
    expect(c1!.tokenIds.length).toBeGreaterThan(0);
    expect(c2!.tokenIds.length).toBeGreaterThan(0);
  });

  it('generates 2 choices for items across multiple skill packs', () => {
    let supportedCount = 0;
    let totalBuildItems = 0;

    for (const pack of Object.values(PACKS)) {
      for (const item of pack.items) {
        if (item.type === 'assemble' || item.type === 'correct' || item.type === 'transform') {
          totalBuildItems++;
          const view = buildView(item, null);
          if (view) {
            const choices = getQuickChoices(view, 42);
            if (choices && choices.length === 2) {
              supportedCount++;
              expect(choices[0]!.text).not.toEqual(choices[1]!.text);
            }
          }
        }
      }
    }

    console.log(`quickChoice coverage: ${supportedCount} / ${totalBuildItems} items (${Math.round((supportedCount / totalBuildItems) * 100)}%)`);
    // Should support at least 85% of all build tasks
    expect(supportedCount / totalBuildItems).toBeGreaterThan(0.85);
  });
});
