import { MINIGAME_DONE_PAUSE } from '../config';
import type { SoundName } from '../audio/sound';
import { t } from '../i18n';
import type { TaskKind } from '../sim/tasks';
import { createCopycatView } from './copycat/view';
import { createLinesView } from './lines/view';
import { createModusView } from './modus/view';
import { createNewsView } from './news/view';
import type { MinigameFactory, MinigameView } from './types';

/** Window mini-games; cargo is played in the office itself. */
const FACTORIES: Partial<Record<TaskKind, MinigameFactory>> = {
  modus: createModusView,
  copycat: createCopycatView,
  news: createNewsView,
  lines: createLinesView,
};

export interface MinigameHost {
  open(kind: TaskKind, seed: number): void;
  close(): void;
  isOpen(): boolean;
  tick(dt: number): void;
  relabel(): void;
}

/** Overlay window around one mini-game. Reports the outcome; the sim decides what it means. */
export function createMinigameHost(handlers: { onWin(): void; onCancel(): void; onSound(name: SoundName): void }): MinigameHost {
  const overlay = document.getElementById('minigame') as HTMLElement;
  let view: MinigameView | null = null;
  let kind: TaskKind | null = null;
  let doneIn = -1;

  const header = document.createElement('header');
  const title = document.createElement('h2');
  const hint = document.createElement('span');
  hint.className = 'mg-hint';
  header.append(title, hint);
  const body = document.createElement('div');
  body.className = 'mg-body';
  const banner = document.createElement('div');
  banner.className = 'mg-banner';
  const panel = document.createElement('div');
  panel.className = 'mg-panel';
  panel.append(header, body, banner);
  overlay.append(panel);

  const relabel = (): void => {
    if (!kind) return;
    title.textContent = t(`task.${kind}`);
    hint.textContent = t('minigame.close');
    banner.textContent = t('minigame.done');
    view?.draw();
  };

  const close = (): void => {
    view?.destroy();
    view = null;
    kind = null;
    doneIn = -1;
    body.replaceChildren();
    overlay.hidden = true;
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || !view || doneIn >= 0) return;
    event.preventDefault();
    close();
    handlers.onCancel();
  });

  overlay.hidden = true;
  return {
    open(nextKind, seed) {
      close();
      const factory = FACTORIES[nextKind];
      if (!factory) return;
      kind = nextKind;
      overlay.hidden = false;
      panel.classList.remove('won');
      view = factory({
        seed,
        body,
        win: () => {
          if (doneIn >= 0) return;
          doneIn = MINIGAME_DONE_PAUSE;
          panel.classList.add('won');
          handlers.onSound('jackpot');
        },
        sound: handlers.onSound,
      });
      relabel();
    },
    close,
    isOpen: () => view !== null,
    tick(dt) {
      if (!view) return;
      if (doneIn >= 0) {
        doneIn -= dt;
        if (doneIn < 0) {
          close();
          handlers.onWin();
        }
        return;
      }
      view.tick(dt);
    },
    relabel,
  };
}
