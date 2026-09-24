import { useEffect } from 'react';
import { usePwa } from '../pwa/usePwa';
import { Onboarding } from '../screens/Onboarding';
import { PathScreen } from '../screens/Path';
import { Practice } from '../screens/practice/Practice';
import { ProgressScreen } from '../screens/Progress';
import { SettingsScreen } from '../screens/Settings';
import { Today } from '../screens/Today';
import { IconAlert, IconPath, IconProgress, IconToday } from '../ui/icons';
import { navigate, useRoute, type Route } from './nav';
import { AppProvider, useApp } from './store';

export function App() {
  const pwa = usePwa();
  return (
    <AppProvider pwa={pwa}>
      <Shell />
    </AppProvider>
  );
}

function BottomNav({ route }: { route: Route }) {
  const items: { r: Route; label: string; Icon: typeof IconToday }[] = [
    { r: 'today', label: 'היום', Icon: IconToday },
    { r: 'path', label: 'המסלול שלי', Icon: IconPath },
    { r: 'progress', label: 'ההתקדמות שלי', Icon: IconProgress },
  ];
  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי">
      <ul>
        {items.map(({ r, label, Icon }) => (
          <li key={r}>
            <a href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
              <Icon />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Shell() {
  const { ready, snap, conflict, reload, updateReady, applyUpdate } = useApp();
  const route = useRoute();

  useEffect(() => {
    if (!ready) return;
    // a practice route without an active segment (e.g. after a restore) goes home
    if (route === 'practice' && !snap.active) navigate('today');
  }, [ready, route, snap.active]);

  if (!ready) {
    return (
      <div className="app">
        <main className="screen" aria-busy="true">
          <p className="brand-name" lang="en" dir="ltr">
            Sentence Lab
          </p>
          <p className="muted">טוען…</p>
        </main>
      </div>
    );
  }

  if (conflict) {
    return (
      <div className="app">
        <main className="screen">
          <div className="banner error" role="alert">
            <IconAlert />
            <div>
              <strong>האפליקציה עודכנה בחלון או בלשונית אחרת.</strong> כדי לא לדרוס התקדמות, צריך לטעון מחדש — הכול שמור.
              <div className="banner-actions">
                <button type="button" className="btn btn-primary" onClick={reload}>
                  טען מחדש
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const onboarding = !snap.profile.onboardingDone && !snap.active;
  let screen;
  if (route === 'practice' && snap.active) screen = <Practice />;
  else if (onboarding && (route === 'today' || route === 'practice')) screen = <Onboarding />;
  else if (route === 'path') screen = <PathScreen />;
  else if (route === 'progress') screen = <ProgressScreen />;
  else if (route === 'settings') screen = <SettingsScreen />;
  else screen = <Today />;

  const showNav = !(route === 'practice' && snap.active);
  return (
    <div className="app">
      {showNav && updateReady && (
        <div className="screen" style={{ paddingBottom: 0 }}>
          <div className="banner info" role="status">
            <IconAlert />
            <div>
              גרסה חדשה מוכנה. ההתקדמות שמורה.
              <div className="banner-actions">
                <button type="button" className="btn btn-secondary" onClick={applyUpdate}>
                  עדכן עכשיו
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {screen}
      {showNav && <BottomNav route={route} />}
    </div>
  );
}
