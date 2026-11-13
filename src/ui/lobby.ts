import { ACCESSORIES, CHICK_COLORS } from '../config';
import { t, type I18nKey } from '../i18n';
import { CODE_LENGTH, isCode, normalizeCode } from '../net/protocol';

/** What the lobby shows about online play. */
export interface OnlineInfo {
  /** A game server is configured for this site. */
  available: boolean;
  status: 'off' | 'connecting' | 'reconnecting' | 'in';
  code: string;
  players: number;
  host: boolean;
  /** Colours other people in the room already wear. */
  taken: number[];
  /** i18n key of the last refusal, shown until the next try. */
  error: I18nKey | null;
}

export interface Lobby {
  setOnline(info: OnlineInfo): void;
  show(color: number, accessory: number): void;
  hide(): void;
  relabel(): void;
}

/** Pre-match panel: pick a colour and an accessory, then start. The chick in the office shows the result live. */
export function createLobby(handlers: {
  onLook(color: number, accessory: number): void;
  onStart(): void;
  onCreate(): void;
  onJoin(code: string): void;
  onLeave(): void;
}): Lobby {
  const panel = document.getElementById('lobby') as HTMLElement;
  panel.innerHTML = `
    <h2></h2>
    <h3 class="lobby-color"></h3><div class="swatches"></div>
    <h3 class="lobby-accessory"></h3><div class="accessories"></div>
    <button type="button" class="lobby-start"></button>
    <div class="lobby-online" hidden>
      <h3 class="online-title"></h3>
      <p class="online-status"></p>
      <div class="online-out">
        <button type="button" class="online-create"></button>
        <form class="online-join"><input class="online-code" maxlength="${CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" /><button type="submit"></button></form>
      </div>
      <div class="online-in">
        <strong class="online-room"></strong>
        <button type="button" class="online-copy"></button>
        <button type="button" class="online-leave"></button>
      </div>
    </div>`;
  const title = panel.querySelector('h2') as HTMLElement;
  const colorTitle = panel.querySelector('.lobby-color') as HTMLElement;
  const accessoryTitle = panel.querySelector('.lobby-accessory') as HTMLElement;
  const start = panel.querySelector('.lobby-start') as HTMLButtonElement;
  let color = 0;
  let accessory = 0;
  let online: OnlineInfo = { available: false, status: 'off', code: '', players: 0, host: false, taken: [], error: null };
  const q = <T extends HTMLElement>(selector: string): T => panel.querySelector(selector) as T;
  const onlineBox = q('.lobby-online');
  const codeInput = q<HTMLInputElement>('.online-code');
  q('.online-create').addEventListener('click', () => handlers.onCreate());
  q<HTMLFormElement>('.online-join').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = normalizeCode(codeInput.value);
    if (isCode(code)) handlers.onJoin(code);
    else codeInput.focus();
  });
  // Typing a room code must not walk the chick around.
  codeInput.addEventListener('keydown', (event) => event.stopPropagation());
  codeInput.addEventListener('keyup', (event) => event.stopPropagation());
  q('.online-leave').addEventListener('click', () => handlers.onLeave());
  q('.online-copy').addEventListener('click', () => {
    void navigator.clipboard?.writeText(window.location.href);
  });

  const swatches = CHICK_COLORS.map((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = `#${hex.toString(16).padStart(6, '0')}`;
    b.addEventListener('click', () => {
      b.blur();
      color = i;
      handlers.onLook(color, accessory);
      refresh();
    });
    panel.querySelector('.swatches')!.append(b);
    return b;
  });
  const accessories = ACCESSORIES.map((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'accessory';
    b.dataset.name = name;
    b.addEventListener('click', () => {
      b.blur();
      accessory = i;
      handlers.onLook(color, accessory);
      refresh();
    });
    panel.querySelector('.accessories')!.append(b);
    return b;
  });
  start.addEventListener('click', () => {
    start.blur();
    handlers.onStart();
  });

  function refresh(): void {
    title.textContent = t('look.title');
    colorTitle.textContent = t('look.color');
    accessoryTitle.textContent = t('look.accessory');
    const inRoom = online.status === 'in';
    start.textContent = inRoom && !online.host ? t('online.waitHost') : t('look.start');
    start.disabled = online.status === 'connecting' || online.status === 'reconnecting' || (inRoom && !online.host);
    onlineBox.hidden = !online.available;
    q('.online-title').textContent = t('online.title');
    q('.online-status').textContent = online.error
      ? t(online.error)
      : online.status === 'connecting'
        ? t('online.connecting')
        : online.status === 'reconnecting'
          ? t('online.reconnecting')
          : inRoom
            ? t('online.players', { count: online.players, max: swatches.length })
            : t('online.hint');
    q('.online-out').hidden = online.status !== 'off';
    q('.online-in').hidden = !inRoom;
    q('.online-create').textContent = t('online.create');
    q('.online-join button').textContent = t('online.join');
    codeInput.placeholder = t('online.code');
    q('.online-room').textContent = t('online.room', { code: online.code });
    q('.online-copy').textContent = t('online.copy');
    q('.online-leave').textContent = t('online.leave');
    swatches.forEach((b, i) => {
      b.disabled = online.taken.includes(i);
      const name = t(`look.color.${i}` as I18nKey);
      b.title = name;
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', String(i === color));
    });
    accessories.forEach((b, i) => {
      b.textContent = t(`look.accessory.${ACCESSORIES[i]!}` as I18nKey);
      b.setAttribute('aria-pressed', String(i === accessory));
    });
  }

  return {
    setOnline(info) {
      online = info;
      refresh();
    },
    show(c, a) {
      color = c;
      accessory = a;
      panel.hidden = false;
      refresh();
    },
    hide() {
      panel.hidden = true;
    },
    relabel: refresh,
  };
}
