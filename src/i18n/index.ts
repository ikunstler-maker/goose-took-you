import { ru } from './ru';
import { ua, type I18nKey } from './ua';

export type Lang = 'ua' | 'ru';
export type { I18nKey };

const DICTS: Record<Lang, Record<I18nKey, string>> = { ua, ru };
let current: Lang = 'ua';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Looks up a string; `{name}` placeholders are filled from `params`. */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const text = DICTS[current][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}
