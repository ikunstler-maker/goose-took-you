import { t } from '../i18n';

export interface SoundControls {
  relabel(): void;
}

/** Mute button and volume slider in the top bar. */
export function createSoundControls(
  initial: { volume: number; muted: boolean },
  handlers: { onChange(volume: number, muted: boolean): void },
): SoundControls {
  const mute = document.getElementById('mute') as HTMLButtonElement;
  const slider = document.getElementById('volume') as HTMLInputElement;
  let { volume, muted } = initial;
  slider.value = String(Math.round(volume * 100));

  const relabel = (): void => {
    const off = muted || volume === 0;
    // A note for sound on, a crossed-out one for sound off: symbols, not words.
    mute.textContent = off ? '♪̸' : '♪';
    mute.setAttribute('aria-pressed', String(off));
    const label = t(off ? 'hud.unmute' : 'hud.mute');
    mute.title = label;
    mute.setAttribute('aria-label', label);
    slider.title = t('hud.volume');
    slider.setAttribute('aria-label', t('hud.volume'));
  };

  mute.addEventListener('click', () => {
    mute.blur();
    muted = !muted;
    // Unmuting a silent slider would do nothing: give it some volume back.
    if (!muted && volume === 0) {
      volume = 0.5;
      slider.value = '50';
    }
    relabel();
    handlers.onChange(volume, muted);
  });
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100;
    muted = false;
    relabel();
    handlers.onChange(volume, muted);
  });
  // Arrow keys move the chick, not the slider.
  slider.addEventListener('change', () => slider.blur());
  relabel();
  return { relabel };
}
