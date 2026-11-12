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

export function t(key: I18nKey): string {
  return DICTS[current][key];
}
