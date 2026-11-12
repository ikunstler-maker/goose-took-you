import { ACCESSORIES, CHICK_COLORS } from '../config';
import type { Lang } from '../i18n';

/** The only things kept between visits (owner-approved): language and the chick's look. */
export interface Settings {
  lang: Lang;
  color: number;
  accessory: number;
}

const KEY = 'goose-took-you.settings.v1';
const DEFAULTS: Settings = { lang: 'ua', color: 0, accessory: 0 };

const index = (value: unknown, length: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length ? value : fallback;

/** Reads settings; storage can be blocked or hold junk, so every field is checked. */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      lang: data.lang === 'ru' || data.lang === 'ua' ? data.lang : DEFAULTS.lang,
      color: index(data.color, CHICK_COLORS.length, DEFAULTS.color),
      accessory: index(data.accessory, ACCESSORIES.length, DEFAULTS.accessory),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...patch }));
  } catch {
    // Private mode or blocked storage: the game still works, the choice just is not remembered.
  }
}
