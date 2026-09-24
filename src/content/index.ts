import type { Item, Lesson, SkillId, SkillPack, UnitId, Example } from './schema';
import { S01 } from './skills/s01';
import { S02 } from './skills/s02';
import { S03 } from './skills/s03';
import { S04 } from './skills/s04';
import { S05 } from './skills/s05';
import { S06 } from './skills/s06';
import { S07 } from './skills/s07';
import { S08 } from './skills/s08';
import { S09 } from './skills/s09';
import { S10 } from './skills/s10';
import { S11 } from './skills/s11';
import { S12 } from './skills/s12';
import { CALIBRATION } from './calibration';

/** Bump when any item changes; recorded with every attempt. */
export const CONTENT_VERSION = '1.0.0';

export const PACKS: Readonly<Record<SkillId, SkillPack>> = {
  S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12,
};

export const ALL_ITEMS: readonly Item[] = [
  ...CALIBRATION,
  ...Object.values(PACKS).flatMap((p) => p.items),
];

export const ITEM_BY_ID: ReadonlyMap<string, Item> = new Map(ALL_ITEMS.map((i) => [i.id, i]));

export const LESSONS: ReadonlyMap<UnitId, Lesson> = new Map(
  Object.values(PACKS).flatMap((p) => p.lessons.map((l) => [l.unit, l] as const)),
);

export function examplesFor(unit: UnitId): Example[] {
  const skill = unit.split('.')[0] as SkillId;
  return PACKS[skill]?.examples[unit] ?? [];
}

export { CALIBRATION };
