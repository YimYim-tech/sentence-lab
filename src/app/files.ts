type DownloadsNs = { save(req: { filename: string; data: string }): Promise<{ status: string }> };
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

export type SaveOutcome = 'saved' | 'started' | 'declined' | 'failed';

/**
 * Offer a text file to the learner. Inside a Claude Artifact the host's `downloads` capability is
 * used (plain download links are inert there); in the installed app a normal download starts.
 */
export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    try {
      const downloads = (await host.use('downloads')) as DownloadsNs | null;
      if (downloads) {
        await downloads.save({ filename, data: text });
        return 'saved';
      }
    } catch (e) {
      return (e as { code?: string } | null)?.code === 'declined' ? 'declined' : 'failed';
    }
  }
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'started';
  } catch {
    return 'failed';
  }
}

export function isShareAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareOrSaveTextFile(
  filename: string,
  text: string,
  title = 'Sentence Lab גיבוי',
  mime = 'application/json',
): Promise<SaveOutcome> {
  if (isShareAvailable()) {
    try {
      const file = new File([text], filename, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          files: [file],
        });
        return 'saved';
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'declined';
    }
  }
  return saveTextFile(filename, text, mime);
}

/** Copy text; must be called from a click handler. Falls back to selecting the given element. */
export async function copyText(text: string, fallbackEl?: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      const range = document.createRange();
      range.selectNodeContents(fallbackEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return false;
  }
}

export async function readFileText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error('too_large');
  return await file.text();
}
