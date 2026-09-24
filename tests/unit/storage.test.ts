import { describe, expect, it } from 'vitest';
import { ITEM_BY_ID, CONTENT_VERSION } from '../../src/content';
import * as S from '../../src/engine/session';
import { applyChange } from '../../src/engine/snapshot';
import { parseBackup, toBackup } from '../../src/storage/backup';
import { ConflictError, openIdbRepo } from '../../src/storage/repo';
import { answer, playSegment, Sim } from './helpers';

let dbCounter = 0;
const fresh = () => openIdbRepo(`test-db-${++dbCounter}`);

describe('IndexedDB repository', () => {
  it('commits engine changes atomically and reloads the same state', async () => {
    const repo = await fresh();
    const sim = new Sim();
    const changes = [sim.run(S.startCalibration)];
    answer(sim, 'correct');
    changes.push(sim.run((s, e) => S.openHelp(s, e, 'hint')));
    for (const c of changes) await repo.commit(c);
    const loaded = await repo.load();
    expect(loaded.active?.segmentId).toBe(sim.snap.active?.segmentId);
  });

  it('persists a partial answer and restores it (refresh in the middle of a task)', async () => {
    const repo = await fresh();
    const sim = new Sim();
    await repo.commit(sim.run(S.startCalibration));
    const view = sim.task!;
    const partial = { answer: ['t1', 't2'], caret: 1, sticky: true, seed: view.build!.seed };
    await repo.commit(sim.run((s, e) => S.updateBuild(s, e, partial)));
    await repo.commit(sim.run((s, e) => S.openHelp(s, e, 'why')));
    const loaded = await repo.load();
    expect(loaded.active?.current?.build).toEqual(partial);
    expect(loaded.active?.current?.help).toBe('why');
    expect(loaded.active?.current?.item.id).toBe(view.item.id);
  });

  it('refuses a write from a stale second tab instead of overwriting progress', async () => {
    const name = `test-db-shared-${++dbCounter}`;
    const tabA = await openIdbRepo(name);
    const tabB = await openIdbRepo(name);
    await tabA.load();
    await tabB.load();
    const sim = new Sim();
    await tabA.commit(sim.run(S.startCalibration));
    await expect(tabB.commit({ profile: sim.snap.profile })).rejects.toBeInstanceOf(ConflictError);
  });

  it('writing the same attempt twice keeps one record', async () => {
    const repo = await fresh();
    const sim = new Sim();
    await repo.commit(sim.run(S.startCalibration));
    answer(sim, 'correct');
    const att = sim.snap.attempts[0]!;
    await repo.commit({ attempts: [att] });
    await repo.commit({ attempts: [att] });
    const loaded = await repo.load();
    expect(loaded.attempts.filter((a) => a.attemptId === att.attemptId)).toHaveLength(1);
  });
});

describe('backup and restore', () => {
  it('round-trips a full snapshot', async () => {
    const sim = new Sim();
    sim.run(S.startCalibration);
    playSegment(sim, () => 'correct');
    const file = JSON.stringify(toBackup(sim.snap, CONTENT_VERSION, sim.now));
    const res = parseBackup(file, ITEM_BY_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot.attempts).toEqual(sim.snap.attempts);
    expect(res.snapshot.profile).toEqual(sim.snap.profile);
    expect(res.snapshot.segments).toEqual(sim.snap.segments);
    expect(res.preview.attempts).toBe(sim.snap.attempts.length);

    const repo = await fresh();
    await repo.replaceAll(res.snapshot);
    const loaded = await repo.load();
    expect(loaded.attempts).toEqual(sim.snap.attempts);
  });

  it('rejects damaged or foreign files without touching existing data', async () => {
    const repo = await fresh();
    const sim = new Sim();
    await repo.commit(sim.run(S.startCalibration));
    const before = await repo.load();
    const good = toBackup(sim.snap, CONTENT_VERSION, sim.now);
    const cases = [
      'not json',
      JSON.stringify({ app: 'other', schemaVersion: 1, data: {} }),
      JSON.stringify({ ...good, schemaVersion: 99 }),
      JSON.stringify({ ...good, data: { ...good.data, attempts: [{ attemptId: 5 }] } }),
      JSON.stringify({ ...good, data: { ...good.data, profile: null } }),
    ];
    for (const c of cases) {
      const r = parseBackup(c, ITEM_BY_ID);
      expect(r.ok).toBe(false);
    }
    const after = await repo.load();
    expect(after).toEqual(before);
  });

  it('drops an imported active task whose content no longer exists', () => {
    const sim = new Sim();
    sim.run(S.startCalibration);
    const b = toBackup(sim.snap, CONTENT_VERSION, sim.now);
    const tampered = {
      ...b,
      data: {
        ...b.data,
        active: { ...b.data.active!, current: { ...b.data.active!.current!, item: { ...b.data.active!.current!.item, v: 99 } } },
      },
    };
    const r = parseBackup(JSON.stringify(tampered), ITEM_BY_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.active).toBeNull();
  });

  it('never executes content from the file (strings stay strings)', () => {
    const sim = new Sim();
    sim.run(S.startCalibration);
    answer(sim, 'correct');
    const b = toBackup(sim.snap, CONTENT_VERSION, sim.now);
    b.data.attempts[0]!.answerText = '<img src=x onerror=alert(1)>';
    const r = parseBackup(JSON.stringify(b), ITEM_BY_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.attempts[0]!.answerText).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('snapshot merging', () => {
  it('applyChange replaces records by id and keeps the rest', () => {
    const sim = new Sim();
    sim.run(S.startCalibration);
    answer(sim, 'correct');
    const a = sim.snap.attempts[0]!;
    const next = applyChange(sim.snap, { attempts: [{ ...a, excluded: true }] });
    expect(next.attempts).toHaveLength(sim.snap.attempts.length);
    expect(next.attempts[0]!.excluded).toBe(true);
  });
});
