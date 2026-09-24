import { useEffect, useRef, useState } from 'react';
import { ALL_ITEMS, CONTENT_VERSION } from '../content';
import { CONFIG, type SegmentSize } from '../engine/config';
import { formatDateTime } from '../engine/time';
import type { Settings, Snapshot } from '../engine/types';
import { backupFileName, parseBackup, toBackup, type BackupPreview } from '../storage/backup';
import { persistenceStatus, requestPersistence } from '../storage/repo';
import { isShareAvailable, readFileText, saveTextFile, shareOrSaveTextFile } from '../app/files';
import { navigate } from '../app/nav';
import { clockNow, useApp } from '../app/store';
import { IconBack, IconDownload, IconShare, IconUpload } from '../ui/icons';
import { Dialog, Section, StorageBanner } from './common';

const ITEM_MAP = new Map(ALL_ITEMS.map((i) => [i.id, i]));

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="stack-tight">
      <span className="small">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([k, text]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const { snap, storage, offlineReady, updateSettings, replaceAll, clearAll } = useApp();
  const [persist, setPersist] = useState<'persisted' | 'best-effort' | 'unsupported' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ snapshot: Snapshot; preview: BackupPreview } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = snap.settings;

  useEffect(() => {
    void persistenceStatus().then(setPersist);
  }, []);

  const set = (patch: Partial<Settings>) => updateSettings(patch);

  const exportBackup = async () => {
    const text = JSON.stringify(toBackup(snap, CONTENT_VERSION, clockNow()), null, 1);
    const r = await shareOrSaveTextFile(backupFileName(clockNow()), text);
    setMessage(
      r === 'saved' || r === 'started'
        ? 'קובץ הגיבוי נוצר. שמור אותו במקום בטוח (למשל ב-Drive).'
        : r === 'declined'
          ? 'הפעולה בוטלה.'
          : 'לא הצלחתי ליצור את הקובץ בסביבה הזאת.',
    );
  };

  const exportReports = async () => {
    const payload = snap.reports.map((r) => {
      const item = ITEM_MAP.get(r.itemId);
      return { ...r, at: new Date(r.at).toISOString(), itemType: item?.type ?? null, unit: item?.unit ?? null };
    });
    const r = await saveTextFile(
      `sentence-lab-reports-${new Date(clockNow()).toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'sentence-lab', contentVersion: CONTENT_VERSION, reports: payload }, null, 1),
    );
    setMessage(r === 'saved' || r === 'started' ? 'קובץ הדיווחים נוצר.' : 'לא הצלחתי ליצור את הקובץ.');
  };

  const onFile = async (file: File | undefined) => {
    setImportError(null);
    if (!file) return;
    try {
      const text = await readFileText(file, CONFIG.maxBackupBytes);
      const res = parseBackup(text, ITEM_MAP);
      if (!res.ok) setImportError(res.error);
      else setPending({ snapshot: res.snapshot, preview: res.preview });
    } catch {
      setImportError('לא הצלחתי לקרוא את הקובץ (ייתכן שהוא גדול מדי). הנתונים הקיימים לא שונו.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="screen" aria-label="הגדרות">
      <header className="row-between">
        <h1 className="screen-title">הגדרות</h1>
        <button type="button" className="btn btn-quiet" onClick={() => navigate('today')}>
          <IconBack />
          חזרה
        </button>
      </header>
      <StorageBanner />

      <Section title="תצוגה">
        <Segmented
          label="גודל טקסט"
          value={s.textSize}
          options={[
            ['normal', 'רגיל'],
            ['large', 'גדול'],
            ['larger', 'גדול מאוד'],
          ] as const}
          onChange={(v) => set({ textSize: v })}
        />
        <Segmented
          label="צבעים"
          value={s.theme}
          options={[
            ['system', 'לפי המכשיר'],
            ['light', 'בהיר'],
            ['dark', 'כהה'],
          ] as const}
          onChange={(v) => set({ theme: v })}
        />
      </Section>

      <Section title="תרגול">
        <Segmented<SegmentSize>
          label="היקף ברירת מחדל למקטע"
          value={s.defaultSize}
          options={[
            ['short', `קצר · ${CONFIG.segmentSizes.short}`],
            ['regular', `רגיל · ${CONFIG.segmentSizes.regular}`],
            ['deep', `מעמיק · ${CONFIG.segmentSizes.deep}`],
          ] as const}
          onChange={(v) => set({ defaultSize: v })}
        />
        <div className="row-between">
          <span className="small">להסתיר את המילים עד שאני מבקש (לנסח קודם בראש)</span>
          <button
            type="button"
            className="chip-btn"
            role="switch"
            aria-checked={s.thinkFirst}
            aria-pressed={s.thinkFirst}
            onClick={() => set({ thinkFirst: !s.thinkFirst })}
          >
            {s.thinkFirst ? 'פעיל' : 'כבוי'}
          </button>
        </div>
      </Section>

      <Section title="שמירה וגיבוי">
        <p className="small">
          {storage === 'memory'
            ? 'תצוגת ניסיון: הדפדפן הזה לא מאפשר שמירה מקומית, ולכן שום דבר לא נשמר.'
            : 'ההתקדמות נשמרת בדפדפן במכשיר הזה בלבד. זה לא גיבוי בענן ואין סנכרון בין מכשירים; ניקוי נתוני דפדפן עלול למחוק אותה.'}
        </p>
        {storage === 'indexeddb' && (
          <p className="faint">
            {persist === 'persisted'
              ? 'הדפדפן אישר שמירה קבועה לאתר הזה.'
              : persist === 'best-effort'
                ? 'הדפדפן לא אישר שמירה קבועה — הוא עלול לפנות את הנתונים כשחסר מקום. גיבוי מדי פעם מומלץ.'
                : 'לא ניתן לבדוק כאן אם השמירה קבועה.'}
            {persist === 'best-effort' && (
              <>
                {' '}
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => void requestPersistence().then(() => persistenceStatus().then(setPersist))}
                >
                  בקש שמירה קבועה
                </button>
              </>
            )}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => void exportBackup()}>
            {isShareAvailable() ? <IconShare /> : <IconDownload />}
            {isShareAvailable() ? 'שתף / שמור גיבוי' : 'ייצא גיבוי'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <IconUpload />
            שחזר מגיבוי
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
        {importError && (
          <p className="small" role="alert" style={{ color: 'var(--err)' }}>
            {importError}
          </p>
        )}
      </Section>

      <Section title="זמינות ללא רשת">
        <p className="small">
          {__SINGLE__
            ? 'בגרסה הזאת (תצוגה בתוך Claude) אין עבודה ללא רשת. באפליקציה המותקנת יש.'
            : offlineReady
              ? 'כל מה שצריך נשמר במכשיר — האפליקציה עובדת גם בלי רשת.'
              : 'עדיין לא הושלמה ההכנה לעבודה ללא רשת. היא מסתיימת אחרי טעינה מלאה עם חיבור.'}
        </p>
      </Section>

      <Section title="דיווחים על שאלות">
        <p className="small">
          {snap.reports.length === 0
            ? 'אין דיווחים.'
            : `${snap.reports.filter((r) => r.status === 'open').length} דיווחים פתוחים. ניסיונות בשאלות שדווחו לא נספרים בהתקדמות.`}
        </p>
        {snap.reports.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => void exportReports()}>
            <IconDownload />
            ייצא דיווחים לבדיקה
          </button>
        )}
      </Section>

      <Section title="איך האפליקציה עובדת">
        <div className="rich small">
          <ul>
            <li>כל תרגיל נבדק מול רשימת תשובות תקינות, טעויות מוכרות וכללים — לא מול משפט יחיד. תשובה שאי אפשר לאמת לא נספרת כטעות.</li>
            <li>הצלחה מיד אחרי שראית את התשובה נרשמת כתיקון בעזרה. הצלחה עצמאית נמדדת בפריט חדש, בהקשר אחר.</li>
            <li>בדיקה "לאחר מרווח" נחשבת רק ביום אחר, לפחות 20 שעות אחרי שהנושא הוצג, ובפריט שלא ראית.</li>
            <li>המרווחים (1, 3, 7, 14, 30 ימים) והכללים למעבר נושא הם ברירות מחדל מתוכננות — לא חוק מדעי.</li>
            <li>דיבור עצמאי, הגייה ושטף לא נמדדים כאן.</li>
          </ul>
        </div>
        <p className="faint num">
          תוכן {CONTENT_VERSION} · {ALL_ITEMS.length} פריטים · נבנה {formatDateTime(Date.parse(__BUILD_TIME__))}
        </p>
        <p className="faint">
          גופנים: Assistant, Atkinson Hyperlegible Next, Secular One — ברישיון SIL Open Font License.
        </p>
      </Section>

      <Section title="מחיקה">
        <button type="button" className="btn btn-secondary" style={{ color: 'var(--err)', borderColor: 'var(--err)' }} onClick={() => setConfirmDelete(true)}>
          מחק את כל הנתונים
        </button>
      </Section>

      {pending && (
        <Dialog title="לשחזר מהגיבוי?" onClose={() => setPending(null)}>
          <dl className="evidence">
            <dt>נוצר</dt>
            <dd>{formatDateTime(Date.parse(pending.preview.exportedAt))}</dd>
            <dt>תשובות</dt>
            <dd>{pending.preview.attempts}</dd>
            <dt>מקטעים</dt>
            <dd>{pending.preview.segments}</dd>
            <dt>פעילות אחרונה</dt>
            <dd>{pending.preview.lastAt ? formatDateTime(pending.preview.lastAt) : '—'}</dd>
          </dl>
          <p className="small">השחזור מחליף את כל ההתקדמות שבמכשיר הזה בנתונים מהקובץ.</p>
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                const snapshot = pending.snapshot;
                setPending(null);
                void replaceAll(snapshot).then(
                  () => setMessage('השחזור הושלם.'),
                  () => setImportError('השחזור נכשל. הנתונים הקודמים נשארו כפי שהיו.'),
                );
              }}
            >
              כן, החלף את ההתקדמות
            </button>
            <button type="button" className="btn btn-quiet btn-block" onClick={() => setPending(null)}>
              ביטול
            </button>
          </div>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog title="למחוק את כל הנתונים?" onClose={() => setConfirmDelete(false)}>
          <p className="small">
            כל התשובות, ההתקדמות והחזרות המתוזמנות יימחקו מהמכשיר הזה. אי אפשר לבטל את זה. אם יש לך קובץ גיבוי, אפשר לשחזר ממנו
            אחר כך.
          </p>
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => {
                setConfirmDelete(false);
                void clearAll().then(() => navigate('today'));
              }}
            >
              כן, למחוק הכול
            </button>
            <button type="button" className="btn btn-quiet btn-block" onClick={() => setConfirmDelete(false)}>
              ביטול
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
