/**
 * Speech synthesis helper using the browser's native Web Speech API.
 * Free, offline-capable, and requires zero external network calls.
 */

let activeUtterance: SpeechSynthesisUtterance | null = null;
let currentSpeakingText: string | null = null;
const listeners = new Set<(speakingText: string | null) => void>();

function notify(text: string | null) {
  currentSpeakingText = text;
  listeners.forEach((fn) => fn(text));
}

export function subscribeSpeech(cb: (speakingText: string | null) => void): () => void {
  listeners.add(cb);
  cb(currentSpeakingText);
  return () => {
    listeners.delete(cb);
  };
}

export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechAvailable()) return null;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;

  // Preferred order: natural/enhanced en-US or en-GB, then any en voice
  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (enVoices.length === 0) return voices[0] ?? null;

  const natural = enVoices.find(
    (v) =>
      /natural|google|samantha|daniel|karen|oliver|serena/i.test(v.name) &&
      (v.lang === 'en-US' || v.lang === 'en-GB'),
  );
  if (natural) return natural;

  const enUsOrGb = enVoices.find((v) => v.lang === 'en-US' || v.lang === 'en-GB');
  return enUsOrGb ?? enVoices[0] ?? null;
}

if (isSpeechAvailable()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickBestVoice();
  };
  cachedVoice = pickBestVoice();
}

export interface SpeakOptions {
  rate?: number; // 1.0 = normal, 0.75 = slow
  pitch?: number;
  onEnd?: () => void;
}

export function stopSpeech(): void {
  if (!isSpeechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
  activeUtterance = null;
  notify(null);
}

export function speakEnglish(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechAvailable()) return false;
  const clean = text.trim();
  if (!clean) return false;

  stopSpeech();

  try {
    const synth = window.speechSynthesis;
    const voice = cachedVoice ?? pickBestVoice();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = voice?.lang ?? 'en-US';
    if (voice) utt.voice = voice;
    utt.rate = options.rate ?? 0.95; // slightly relaxed natural pace
    utt.pitch = options.pitch ?? 1.0;

    utt.onstart = () => {
      notify(clean);
    };

    utt.onend = () => {
      if (activeUtterance === utt) {
        activeUtterance = null;
        notify(null);
        options.onEnd?.();
      }
    };

    utt.onerror = () => {
      if (activeUtterance === utt) {
        activeUtterance = null;
        notify(null);
      }
    };

    activeUtterance = utt;
    synth.speak(utt);
    return true;
  } catch {
    activeUtterance = null;
    notify(null);
    return false;
  }
}
