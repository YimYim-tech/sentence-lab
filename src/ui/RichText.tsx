import { Fragment, type ReactNode } from 'react';

/** Inline text: `backticked` fragments become isolated left-to-right English. */
export function Inline({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          // short fragments never break; a long sentence may wrap (still one isolated LTR run),
          // so it cannot push a narrow screen sideways
          <code key={i} className={p.length > 22 ? 'en-inline wrap' : 'en-inline'} lang="en" dir="ltr">
            {p}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Block text: paragraphs split on "\n"; lines starting with "• " become a list. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`}>
          {bullets.map((b, i) => (
            <li key={i}>
              <Inline text={b} />
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of lines) {
    if (line.startsWith('• ')) {
      bullets.push(line.slice(2));
    } else {
      flush();
      blocks.push(
        <p key={`p${blocks.length}`}>
          <Inline text={line} />
        </p>,
      );
    }
  }
  flush();
  return <div className={`rich ${className ?? ''}`}>{blocks}</div>;
}

/** An English sentence shown on its own. */
export function En({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`en ${className ?? ''}`} lang="en" dir="ltr">
      {children}
    </span>
  );
}

export function Chain({ links, label }: { links: readonly string[]; label?: string }) {
  return (
    <div className="chain" role="img" aria-label={label ?? `מבנה: ${links.join(' ואז ')}`} lang="en" dir="ltr">
      {links.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="joint" aria-hidden="true" />}
          <span className="link">{l}</span>
        </Fragment>
      ))}
    </div>
  );
}
