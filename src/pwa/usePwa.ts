import { useEffect, useRef, useState } from 'react';

const READY_KEY = 'sl-offline-ready';

function readFlag(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1' && Boolean(navigator.serviceWorker?.controller);
  } catch {
    return false;
  }
}

/**
 * Service worker registration (installable build only). The app is "available offline" only once
 * the service worker has installed and cached everything; updates wait for the learner's OK and
 * are never applied in the middle of an answer.
 */
export function usePwa() {
  const [offlineReady, setOfflineReady] = useState<boolean>(() => (__SINGLE__ ? false : readFlag()));
  const [updateReady, setUpdateReady] = useState(false);
  const applyRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (__SINGLE__ || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const markReady = () => {
      setOfflineReady(true);
      try {
        localStorage.setItem(READY_KEY, '1');
      } catch {
        /* storage unavailable: the flag just is not remembered */
      }
    };
    void import('workbox-window').then(({ Workbox }) => {
      if (cancelled) return;
      const wb = new Workbox('./sw.js', { scope: './' });
      wb.addEventListener('installed', (e) => {
        if (!e.isUpdate) markReady();
      });
      wb.addEventListener('activated', (e) => {
        if (!e.isUpdate) markReady();
      });
      wb.addEventListener('waiting', () => {
        wb.messageSkipWaiting();
      });
      wb.addEventListener('controlling', () => {
        window.location.reload();
      });
      wb.register()
        .then((reg) => {
          if (reg?.active && navigator.serviceWorker.controller) markReady();
        })
        .catch(() => undefined);
      const onVisible = () => {
        if (document.visibilityState === 'visible') void wb.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', onVisible);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { offlineReady, updateReady, applyUpdate: () => applyRef.current() };
}
