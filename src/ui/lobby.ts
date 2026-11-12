import { ACCESSORIES, CHICK_COLORS } from '../config';
import { t, type I18nKey } from '../i18n';

export interface Lobby {
  show(color: number, accessory: number): void;
  hide(): void;
  relabel(): void;
}

/** Pre-match panel: pick a colour and an accessory, then start. The chick in the office shows the result live. */
export function createLobby(handlers: { onLook(color: number, accessory: number): void; onStart(): void }): Lobby {
  const panel = document.getElementById('lobby') as HTMLElement;
  panel.innerHTML = `
    <h2></h2>
    <h3 class="lobby-color"></h3><div class="swatches"></div>
    <h3 class="lobby-accessory"></h3><div class="accessories"></div>
    <button type="button" class="lobby-start"></button>`;
  const title = panel.querySelector('h2') as HTMLElement;
  const colorTitle = panel.querySelector('.lobby-color') as HTMLElement;
  const accessoryTitle = panel.querySelector('.lobby-accessory') as HTMLElement;
  const start = panel.querySelector('.lobby-start') as HTMLButtonElement;
  let color = 0;
  let accessory = 0;

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
    start.textContent = t('look.start');
    swatches.forEach((b, i) => {
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
