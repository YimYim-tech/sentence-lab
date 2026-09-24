import type { ReactNode } from 'react';
import { useApp } from '../app/store';
import { IconAlert, IconGear } from '../ui/icons';
import type { UnitStatus } from '../engine/progress';
import { STATUS_HE } from '../engine/progress';

export function StorageBanner() {
  const { storage, save } = useApp();
  if (storage === 'memory') {
    return (
      <div className="banner error" role="alert">
        <IconAlert />
        <div>
          <strong>תצוגת ניסיון — ההתקדמות לא נשמרת כאן.</strong> הדפדפן לא מאפשר שמירה מקומית (למשל בחלון פרטי).
          אפשר לתרגל, אבל שום דבר לא יישמר אחרי סגירה.
        </div>
      </div>
    );
  }
  if (save === 'error') {
    return (
      <div className="banner error" role="alert">
        <IconAlert />
        <div>
          <strong>השמירה האחרונה נכשלה.</strong> ההתקדמות האחרונה אולי לא נשמרה במכשיר. מומלץ לייצא גיבוי מההגדרות.
          <div className="banner-actions">
            <a className="btn btn-secondary" href="#settings">
              לגיבוי
            </a>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function ScreenHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="stack-tight">
      <div className="row-between">
        <h1 className="screen-title">{title}</h1>
        <a className="icon-btn" href="#settings" aria-label="הגדרות, גיבוי ועזרה">
          <IconGear />
        </a>
      </div>
      {children}
    </header>
  );
}

export function StatusChip({ status }: { status: UnitStatus }) {
  return <span className={`status s-${status}`}>{STATUS_HE[status]}</span>;
}

export function Section({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  return (
    <section className="panel stack-tight" aria-label={label ?? title}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="scrim" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
