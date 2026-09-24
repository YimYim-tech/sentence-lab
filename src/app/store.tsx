import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALL_ITEMS, CONTENT_VERSION } from '../content';
import { makeIndex } from '../engine/select';
import type { Env } from '../engine/session';
import { applyChange, emptySnapshot } from '../engine/snapshot';
import type { Change, EventRecord, Settings, Snapshot } from '../engine/types';
import { randomId } from '../engine/rng';
import { ConflictError, isEmptyChange, openRepo, requestPersistence, type Repo } from '../storage/repo';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AppCtx {
  ready: boolean;
  snap: Snapshot;
  storage: 'indexeddb' | 'memory';
  storageNote: string | null;
  save: SaveState;
  conflict: boolean;
  offlineReady: boolean;
  updateReady: boolean;
  applyUpdate: () => void;
  run: (step: (snap: Snapshot, env: Env) => Change) => Change;
  replaceAll: (snap: Snapshot) => Promise<void>;
  clearAll: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  env: () => Env;
  reload: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

const idx = makeIndex(ALL_ITEMS);
const appSession = randomId('app');

/** opened once per page, even when React mounts the provider twice (StrictMode) */
let opening: Promise<{ repo: Repo; fallbackReason: string | null; snapshot: Snapshot }> | null = null;
function openOnce() {
  opening ??= openRepo().then(async ({ repo, fallbackReason }) => ({ repo, fallbackReason, snapshot: await repo.load() }));
  return opening;
}

/** Test hook: end-to-end tests may install window.__SL_NOW__ to move the clock. */
export function clockNow(): number {
  const w = globalThis as unknown as { __SL_NOW__?: () => number };
  return typeof w.__SL_NOW__ === 'function' ? w.__SL_NOW__() : Date.now();
}

function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.setAttribute('lang', 'he');
  root.setAttribute('dir', 'rtl');
  if (s.textSize === 'normal') root.removeAttribute('data-text');
  else root.setAttribute('data-text', s.textSize);
  // only touch data-theme when the learner chose one explicitly (the host may stamp its own)
  if (s.theme === 'system') {
    if (root.dataset.slTheme) {
      root.removeAttribute('data-theme');
      delete root.dataset.slTheme;
    }
  } else {
    root.setAttribute('data-theme', s.theme);
    root.dataset.slTheme = '1';
  }
}

export function AppProvider({
  children,
  pwa,
}: {
  children: ReactNode;
  pwa: { offlineReady: boolean; updateReady: boolean; applyUpdate: () => void };
}) {
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState<Snapshot>(() => emptySnapshot(clockNow()));
  const [storage, setStorage] = useState<'indexeddb' | 'memory'>('indexeddb');
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [conflict, setConflict] = useState(false);
  const snapRef = useRef(snap);
  const repoRef = useRef<Repo | null>(null);
  const conflictRef = useRef(false);

  const env = useCallback(
    (): Env => ({ idx, now: clockNow(), appSession, contentVersion: CONTENT_VERSION }),
    [],
  );

  const load = useCallback(async () => {
    const { repo, fallbackReason, snapshot: loaded } = await openOnce();
    if (repoRef.current) return;
    repoRef.current = repo;
    setStorage(repo.kind);
    setStorageNote(fallbackReason);
    snapRef.current = loaded;
    setSnap(loaded);
    applySettings(loaded.settings);
    repo.onExternalChange(() => {
      conflictRef.current = true;
      setConflict(true);
    });
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const commit = useCallback((change: Change) => {
    const repo = repoRef.current;
    if (!repo || isEmptyChange(change)) return;
    setSave('saving');
    repo.commit(change).then(
      () => setSave('saved'),
      (e: unknown) => {
        if (e instanceof ConflictError) {
          conflictRef.current = true;
          setConflict(true);
          return;
        }
        setSave('error');
        const ev: EventRecord = {
          id: randomId('ev'),
          at: clockNow(),
          type: 'save_failed',
          data: { message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' },
        };
        const next = applyChange(snapRef.current, { events: [ev] });
        snapRef.current = next;
        setSnap(next);
      },
    );
  }, []);

  const run = useCallback(
    (step: (s: Snapshot, e: Env) => Change): Change => {
      if (conflictRef.current) return {};
      const change = step(snapRef.current, env());
      if (isEmptyChange(change)) return change;
      const next = applyChange(snapRef.current, change);
      snapRef.current = next;
      setSnap(next);
      commit(change);
      return change;
    },
    [commit, env],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const settings = { ...snapRef.current.settings, ...patch };
      applySettings(settings);
      run(() => ({ settings }));
    },
    [run],
  );

  const replaceAll = useCallback(async (s: Snapshot) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.replaceAll(s);
    snapRef.current = s;
    setSnap(s);
    applySettings(s.settings);
    setSave('saved');
  }, []);

  const clearAll = useCallback(async () => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.clearAll();
    const fresh = emptySnapshot(clockNow());
    snapRef.current = fresh;
    setSnap(fresh);
    applySettings(fresh.settings);
  }, []);

  // ask the browser to keep the data (once, after the learner has started)
  useEffect(() => {
    if (!ready || storage !== 'indexeddb') return;
    if (snap.profile.onboardingDone && !snap.profile.persistRequested) {
      void requestPersistence().finally(() => {
        run((s) => ({ profile: { ...s.profile, persistRequested: true } }));
      });
    }
  }, [ready, storage, snap.profile.onboardingDone, snap.profile.persistRequested, run]);

  const value = useMemo<AppCtx>(
    () => ({
      ready,
      snap,
      storage,
      storageNote,
      save,
      conflict,
      offlineReady: pwa.offlineReady,
      updateReady: pwa.updateReady,
      applyUpdate: pwa.applyUpdate,
      run,
      replaceAll,
      clearAll,
      updateSettings,
      env,
      reload: () => window.location.reload(),
    }),
    [ready, snap, storage, storageNote, save, conflict, pwa, run, replaceAll, clearAll, updateSettings, env],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { idx as contentIndex };
