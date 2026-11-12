import { describe, expect, it } from 'vitest';
import { ru } from './ru';
import { ua } from './ua';

describe('i18n', () => {
  it('has the same keys in UA and RU', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(ua).sort());
  });

  it('has no empty strings', () => {
    for (const value of [...Object.values(ua), ...Object.values(ru)]) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
