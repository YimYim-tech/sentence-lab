/**
 * Gentle haptic feedback helper for mobile touch interaction.
 * Gracefully silent when unsupported or disabled by device settings.
 */

export function vibrateTap(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // ignore
  }
}

export function vibrateSuccess(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([15, 50, 15]);
    }
  } catch {
    // ignore
  }
}

export function vibrateError(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([30, 60, 30]);
    }
  } catch {
    // ignore
  }
}
