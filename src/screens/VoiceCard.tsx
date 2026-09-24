import { useMemo, useRef, useState } from 'react';
import { buildVoiceCard } from '../app/voiceCard';
import { copyText } from '../app/files';
import { clockNow, contentIndex, useApp } from '../app/store';
import { UNIT_BY_ID } from '../content/units';
import { IconCopy } from '../ui/icons';
import { Dialog } from './common';

export function VoiceCard({ onClose }: { onClose: () => void }) {
  const { snap } = useApp();
  const card = useMemo(() => buildVoiceCard(snap, contentIndex, clockNow()), [snap]);
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState<null | 'ok' | 'select'>(null);
  return (
    <Dialog title="כרטיס לתרגול קולי" onClose={onClose}>
      <p className="small">
        הכרטיס נבנה מהתשובות שלך באפליקציה: {card.units.map((u) => UNIT_BY_ID[u].nameHe).join(', ')} · {card.items} תרגילים.
        מעתיקים, מדביקים בשיחה עם ChatGPT או Gemini <strong>לפני</strong> הנסיעה, ועוברים למצב קולי.
      </p>
      <p className="faint">
        האפליקציה לא שולחת את הכרטיס לשום מקום. התרגול הקולי מתנהל אצל המורה הקולי, ולא נמדד כאן. בזמן נהיגה — בלי להסתכל
        במסך, ועוצרים כשהדרך דורשת תשומת לב.
      </p>
      <pre
        ref={preRef}
        className="en"
        lang="en"
        dir="ltr"
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: '0.82rem',
          background: 'var(--tray)',
          padding: '0.75rem',
          borderRadius: 10,
          maxHeight: '40vh',
          overflow: 'auto',
          userSelect: 'all',
          margin: 0,
        }}
      >
        {card.text}
      </pre>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => {
          void copyText(card.text, preRef.current).then((ok) => setCopied(ok ? 'ok' : 'select'));
        }}
      >
        <IconCopy />
        העתק כרטיס שיעור לג'מיני
      </button>
      {copied === 'ok' && (
        <p className="small" style={{ color: 'var(--ok)', fontWeight: 700 }} role="status">
          ✓ הכרטיס הועתק! עכשיו פותחים את ג'מיני, מדביקים ומפעילים שיחה קולית.
        </p>
      )}
      {copied === 'select' && (
        <p className="small" role="status">
          ההעתקה האוטומטית לא זמינה כאן — הטקסט סומן, אפשר להעתיק אותו ידנית.
        </p>
      )}
      <a
        href="https://gemini.google.com/app"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary btn-block"
        style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
      >
        ✨ פתח את Gemini
      </a>
      <button type="button" className="btn btn-quiet btn-block" onClick={onClose}>
        סגור
      </button>
    </Dialog>
  );
}
