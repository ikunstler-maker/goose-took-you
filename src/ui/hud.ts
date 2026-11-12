import { getLang, setLang, t, type Lang } from '../i18n';
import type { RoomType } from '../sim/prefabs';

export interface Hud {
  setRoom(type: RoomType | null): void;
  setSeed(seed: number): void;
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function createHud(handlers: { onNewOffice(): void; onLangChange(): void }): Hud {
  const roomName = el('room-name');
  const newOffice = el<HTMLButtonElement>('new-office');
  const langButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#lang button'));
  let room: RoomType | null = null;
  let seed = 0;
  let dimTimer = 0;

  const refresh = (): void => {
    document.title = t('app.title');
    document.documentElement.lang = getLang() === 'ua' ? 'uk' : 'ru';
    el('title').textContent = t('app.title');
    el('controls').textContent = t('hud.controls');
    el('seed').textContent = `${t('hud.seed')} ${seed}`;
    newOffice.textContent = t('hud.newOffice');
    roomName.textContent = room ? t(`room.${room}`) : t('room.corridor');
    for (const button of langButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === getLang()));
    }
  };

  newOffice.addEventListener('click', () => {
    newOffice.blur();
    handlers.onNewOffice();
  });
  for (const button of langButtons) {
    button.addEventListener('click', () => {
      button.blur();
      setLang(button.dataset.lang as Lang);
      refresh();
      handlers.onLangChange();
    });
  }
  refresh();

  return {
    setRoom(type) {
      room = type;
      refresh();
      roomName.classList.remove('dim');
      window.clearTimeout(dimTimer);
      dimTimer = window.setTimeout(() => roomName.classList.add('dim'), 2500);
    },
    setSeed(value) {
      seed = value;
      refresh();
    },
  };
}
