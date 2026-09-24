import { useEffect, useState } from 'react';
import { isSpeechAvailable, speakEnglish, stopSpeech, subscribeSpeech } from './speech';
import { IconVolume, IconVolumeSlow } from './icons';

export function AudioButton({
  text,
  rate = 0.95,
  showSlowToggle = false,
  className = '',
}: {
  text: string;
  rate?: number;
  showSlowToggle?: boolean;
  className?: string;
}) {
  const [available] = useState(isSpeechAvailable);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!available) return;
    return subscribeSpeech((speaking) => {
      setPlaying(speaking === text.trim());
    });
  }, [available, text]);

  if (!available) return null;

  const togglePlay = (slowRate = false) => {
    if (playing) {
      stopSpeech();
    } else {
      speakEnglish(text, { rate: slowRate ? 0.75 : rate });
    }
  };

  return (
    <div className={`audio-group ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <button
        type="button"
        className={`icon-btn audio-btn${playing && !slow ? ' is-speaking' : ''}`}
        onClick={() => {
          setSlow(false);
          togglePlay(false);
        }}
        aria-label={playing && !slow ? 'עצור השמעה' : `השמע באנגלית: "${text}"`}
        title="השמע באנגלית"
      >
        <IconVolume width={18} height={18} />
      </button>
      {showSlowToggle && (
        <button
          type="button"
          className={`icon-btn audio-btn-slow${playing && slow ? ' is-speaking' : ''}`}
          onClick={() => {
            setSlow(true);
            togglePlay(true);
          }}
          aria-label={playing && slow ? 'עצור השמעה' : `השמע לאט: "${text}"`}
          title="השמע לאט"
        >
          <IconVolumeSlow width={16} height={16} />
        </button>
      )}
    </div>
  );
}
