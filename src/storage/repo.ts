/**
 * Persistence. IndexedDB is the source of truth for learning data; every engine step is committed
 * as ONE transaction guarded by a revision number, so a second open tab can never silently
 * overwrite progress. When IndexedDB is unavailable, a memory repository runs in "demo" mode and
 * the UI says so plainly.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { emptySnapshot, SCHEMA_VERSION } from '../engine/snapshot';
import type {
  ActiveSegment,
  AttemptRecord,
  Change,
  EventRecord,
  Exposure,
  Profile,
  ReportRecord,
  SegmentSummary,
  Settings,
  Snapshot,
  UnitState,
} from '../engine/types';

export const DB_NAME = 'sentence-lab';
export const DB_VERSION = 1;

export class ConflictError extends Error {
  constructor() {
    super('changed in another tab');
    this.name = 'ConflictError';
  }
}

export class StorageError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'StorageError';
  }
}

export interface Repo {
  readonly kind: 'indexeddb' | 'memory';
  load(): Promise<Snapshot>;
  commit(change: Change): Promise<void>;
  replaceAll(snap: Snapshot): Promise<void>;
  clearAll(): Promise<void>;
  /** called when another tab committed (BroadcastChannel) */
  onExternalChange(cb: () => void): void;
}

/** identifies this tab, so a tab never treats its own broadcast as an outside change */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const STORES = ['meta', 'units', 'attempts', 'exposures', 'active', 'segments', 'reports', 'events'] as const;
type StoreName = (typeof STORES)[number];

function storesFor(change: Change): StoreName[] {
  const s = new Set<StoreName>(['meta']);
  if (change.profile || change.settings) s.add('meta');
  if (change.units?.length) s.add('units');
  if (change.attempts?.length) s.add('attempts');
  if (change.exposures?.length) s.add('exposures');
  if (change.active !== undefined) s.add('active');
  if (change.segments?.length) s.add('segments');
  if (change.reports?.length) s.add('reports');
  if (change.events?.length) s.add('events');
  return [...s];
}

export function isEmptyChange(c: Change): boolean {
  return (
    !c.profile &&
    !c.settings &&
    !c.units?.length &&
    !c.attempts?.length &&
    !c.exposures?.length &&
    c.active === undefined &&
    !c.segments?.length &&
    !c.reports?.length &&
    !c.events?.length
  );
}

/* ---------------------------------------------------------------- IndexedDB */

class IdbRepo implements Repo {
  readonly kind = 'indexeddb' as const;
  private rev = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private channel: BroadcastChannel | null = null;
  private listeners: (() => void)[] = [];

  constructor(private db: IDBPDatabase) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('sentence-lab');
      this.channel.onmessage = (e: MessageEvent) => {
        const data = e.data as { rev?: number; tab?: string } | null;
        if (!data || data.tab === TAB_ID || typeof data.rev !== 'number') return;
        if (data.rev !== this.rev) this.listeners.forEach((l) => l());
      };
    }
  }

  onExternalChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  async load(): Promise<Snapshot> {
    const tx = this.db.transaction([...STORES], 'readonly');
    const meta = tx.objectStore('meta');
    const [rev, profile, settings, units, attempts, exposures, active, segments, reports, events] = await Promise.all([
      meta.get('rev') as Promise<number | undefined>,
      meta.get('profile') as Promise<Profile | undefined>,
      meta.get('settings') as Promise<Settings | undefined>,
      tx.objectStore('units').getAll() as Promise<UnitState[]>,
      tx.objectStore('attempts').getAll() as Promise<AttemptRecord[]>,
      tx.objectStore('exposures').getAll() as Promise<Exposure[]>,
      tx.objectStore('active').get('segment') as Promise<ActiveSegment | undefined>,
      tx.objectStore('segments').getAll() as Promise<SegmentSummary[]>,
      tx.objectStore('reports').getAll() as Promise<ReportRecord[]>,
      tx.objectStore('events').getAll() as Promise<EventRecord[]>,
    ]);
    await tx.done;
    this.rev = rev ?? 0;
    const base = emptySnapshot(Date.now());
    const unitMap = { ...base.units };
    for (const u of units) unitMap[u.unit] = u;
    return {
      profile: profile ?? base.profile,
      settings: settings ?? base.settings,
      units: unitMap,
      attempts: attempts.sort((a, b) => a.submittedAt - b.submittedAt),
      exposures: Object.fromEntries(exposures.map((e) => [e.itemId, e])),
      active: active ?? null,
      segments: segments.sort((a, b) => a.startedAt - b.startedAt),
      reports,
      events: events.sort((a, b) => a.at - b.at),
    };
  }

  commit(change: Change): Promise<void> {
    const run = async () => {
      if (isEmptyChange(change)) return;
      let tx;
      try {
        tx = this.db.transaction(storesFor(change), 'readwrite');
      } catch (e) {
        throw new StorageError(e);
      }
      const meta = tx.objectStore('meta');
      const stored = ((await meta.get('rev')) as number | undefined) ?? 0;
      if (stored !== this.rev) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new ConflictError();
      }
      const writes: Promise<unknown>[] = [meta.put(stored + 1, 'rev')];
      if (change.profile) writes.push(meta.put(change.profile, 'profile'));
      if (change.settings) writes.push(meta.put(change.settings, 'settings'));
      const put = (name: StoreName, list: readonly unknown[] | undefined) => {
        if (!list?.length) return;
        const st = tx.objectStore(name);
        for (const v of list) writes.push(st.put(v));
      };
      put('units', change.units);
      put('attempts', change.attempts);
      put('exposures', change.exposures);
      put('segments', change.segments);
      put('reports', change.reports);
      put('events', change.events);
      if (change.active !== undefined) {
        const st = tx.objectStore('active');
        writes.push(change.active === null ? st.delete('segment') : st.put(change.active, 'segment'));
      }
      try {
        await Promise.all(writes);
        await tx.done;
      } catch (e) {
        throw new StorageError(e);
      }
      this.rev = stored + 1;
      this.channel?.postMessage({ rev: this.rev, tab: TAB_ID });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async replaceAll(snap: Snapshot): Promise<void> {
    const run = async () => {
      const tx = this.db.transaction([...STORES], 'readwrite');
      const stored = ((await tx.objectStore('meta').get('rev')) as number | undefined) ?? 0;
      await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
      const meta = tx.objectStore('meta');
      const writes: Promise<unknown>[] = [
        meta.put(stored + 1, 'rev'),
        meta.put(SCHEMA_VERSION, 'schemaVersion'),
        meta.put(snap.profile, 'profile'),
        meta.put(snap.settings, 'settings'),
      ];
      for (const u of Object.values(snap.units)) writes.push(tx.objectStore('units').put(u));
      for (const a of snap.attempts) writes.push(tx.objectStore('attempts').put(a));
      for (const e of Object.values(snap.exposures)) writes.push(tx.objectStore('exposures').put(e));
      for (const s of snap.segments) writes.push(tx.objectStore('segments').put(s));
      for (const r of snap.reports) writes.push(tx.objectStore('reports').put(r));
      for (const e of snap.events) writes.push(tx.objectStore('events').put(e));
      if (snap.active) writes.push(tx.objectStore('active').put(snap.active, 'segment'));
      try {
        await Promise.all(writes);
        await tx.done;
      } catch (e) {
        throw new StorageError(e);
      }
      this.rev = stored + 1;
      this.channel?.postMessage({ rev: this.rev, tab: TAB_ID });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async clearAll(): Promise<void> {
    await this.replaceAll(emptySnapshot(Date.now()));
  }
}

/* ------------------------------------------------------------------- memory */

export class MemoryRepo implements Repo {
  readonly kind = 'memory' as const;
  private snap: Snapshot;
  constructor(initial?: Snapshot) {
    this.snap = initial ?? emptySnapshot(Date.now());
  }
  async load(): Promise<Snapshot> {
    return this.snap;
  }
  async commit(): Promise<void> {
    // the UI keeps the in-memory snapshot; nothing survives a reload in demo mode
  }
  async replaceAll(snap: Snapshot): Promise<void> {
    this.snap = snap;
  }
  async clearAll(): Promise<void> {
    this.snap = emptySnapshot(Date.now());
  }
  onExternalChange(): void {}
}

/* ------------------------------------------------------------------ opening */

export async function openIdbRepo(name = DB_NAME): Promise<Repo> {
  const db = await openDB(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      // version-by-version upgrades; never delete stores that hold history
      if (oldVersion < 1) {
        database.createObjectStore('meta');
        database.createObjectStore('units', { keyPath: 'unit' });
        const attempts = database.createObjectStore('attempts', { keyPath: 'attemptId' });
        attempts.createIndex('bySegment', 'segmentId');
        attempts.createIndex('byItem', 'itemId');
        database.createObjectStore('exposures', { keyPath: 'itemId' });
        database.createObjectStore('active');
        database.createObjectStore('segments', { keyPath: 'segmentId' });
        database.createObjectStore('reports', { keyPath: 'reportId' });
        database.createObjectStore('events', { keyPath: 'id' });
      }
    },
    blocked() {
      // an older tab holds the database open; the new version waits
    },
  });
  // probe: a real write and read-back, so a browser that silently refuses storage is detected
  const probe = `probe-${Date.now()}`;
  const tx = db.transaction('meta', 'readwrite');
  await tx.store.put(probe, 'probe');
  const back = await tx.store.get('probe');
  await tx.done;
  if (back !== probe) throw new Error('storage probe failed');
  const meta = db.transaction('meta', 'readwrite');
  if ((await meta.store.get('schemaVersion')) === undefined) await meta.store.put(SCHEMA_VERSION, 'schemaVersion');
  await meta.done;
  return new IdbRepo(db);
}

export interface OpenResult {
  repo: Repo;
  /** why storage fell back to memory, if it did */
  fallbackReason: string | null;
}

export async function openRepo(): Promise<OpenResult> {
  if (typeof indexedDB === 'undefined') {
    return { repo: new MemoryRepo(), fallbackReason: 'IndexedDB לא זמין בדפדפן הזה' };
  }
  try {
    const repo = await Promise.race([
      openIdbRepo(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    return { repo, fallbackReason: null };
  } catch (e) {
    return { repo: new MemoryRepo(), fallbackReason: e instanceof Error ? e.message : 'storage unavailable' };
  }
}

/* ----------------------------------------------------- persistent storage */

export async function persistenceStatus(): Promise<'persisted' | 'best-effort' | 'unsupported'> {
  try {
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
