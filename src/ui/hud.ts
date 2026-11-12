import { getLang, setLang, t, type I18nKey, type Lang } from '../i18n';
import type { RoomType } from '../sim/prefabs';
import type { Task } from '../sim/tasks';
import { LOCAL_PLAYER, me, progress, type WorldState } from '../sim/world';

export interface Hud {
  setRoom(type: RoomType | null): void;
  setSeed(seed: number): void;
  /** Redraws the task list, the shared progress bar and the interaction prompt. */
  setTasks(world: WorldState): void;
  /** Short shout bubble in the middle of the screen, e.g. a slipping box. */
  shout(key: I18nKey, params?: Record<string, string | number>): void;
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function createHud(handlers: { onNewOffice(): void; onLangChange(lang: Lang): void }): Hud {
  const roomName = el('room-name');
  const newOffice = el<HTMLButtonElement>('new-office');
  const langButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#lang button'));
  const progressLabel = document.querySelector('#progress span') as HTMLElement;
  const progressFill = document.querySelector('#progress .fill') as HTMLElement;
  const tasksTitle = document.querySelector('#tasks h2') as HTMLElement;
  const tasksList = document.querySelector('#tasks ul') as HTMLElement;
  const prompt = el('prompt');
  const shoutEl = el('shout');
  let shoutTimer = 0;
  let room: RoomType | null = null;
  let seed = 0;
  let dimTimer = 0;
  let world: WorldState | null = null;

  const drawTasks = (): void => {
    if (!world) return;
    const { tasks, stations, level } = world;
    const bar = progress(world);
    progressLabel.textContent = bar >= 1 ? t('hud.allDone') : t('hud.progress');
    progressFill.style.width = `${bar * 100}%`;
    const goose = me(world).role === 'goose' && world.phase !== 'lobby';
    tasksTitle.textContent = goose ? t('hud.tasksFake') : t('hud.tasks');
    el('controls').textContent = goose ? t('hud.controlsGoose') : t('hud.controls');
    const items = tasks
      .filter((task) => task.owner === LOCAL_PLAYER)
      .map((task) => {
        const li = document.createElement('li');
        const roomType = level.rooms[stations[task.station]!.room]!.type;
        li.textContent =
          task.kind === 'cargo' && task.started
            ? t('task.cargoHint', { task: t('task.cargo'), hint: cargoHint(task) })
            : t('task.where', { task: t(`task.${task.kind}`), room: t(`room.${roomType}`) });
        li.classList.toggle('done', task.done);
        return li;
      });
    tasksList.replaceChildren(...items);
    prompt.textContent = promptText(world);
    prompt.hidden = prompt.textContent === '';
  };

  const cargoHint = (task: Task): string => {
    const type = task.target === null ? 'lounge' : world!.level.rooms[task.target]!.type;
    return t(`cargo.hint.${type}` as I18nKey);
  };

  const promptText = (w: WorldState): string => {
    const self = me(w);
    if (w.phase !== 'play' || self.activeTask !== null || !self.alive) return '';
    const lines: string[] = [];
    if (self.canPack !== null) {
      lines.push(self.packCooldown > 0 ? t('hud.packWait', { seconds: Math.ceil(self.packCooldown) }) : t('hud.pack', { key: 'Q' }));
    }
    if (self.canReport !== null) lines.push(t('hud.report', { key: 'R' }));
    const main = mainPrompt(w);
    if (main) lines.unshift(main);
    return lines.join(' · ');
  };

  const mainPrompt = (w: WorldState): string => {
    const self = me(w);
    const p = self.prompt;
    if (p?.kind === 'task') return t('hud.interact', { key: 'E', task: t(`task.${w.tasks[p.task]!.kind}`) });
    if (p?.kind === 'pickup') return t('hud.pickup', { key: 'E' });
    if (p?.kind === 'deliver') return t('hud.deliver', { key: 'E' });
    if (p?.kind === 'button') return t('hud.button', { key: 'E' });
    if (self.carrying !== null) {
      const box = w.boxes.find((b) => b.id === self.carrying);
      return box ? t('hud.carrying', { hint: cargoHint(w.tasks[box.task]!) }) : '';
    }
    return '';
  };

  const refresh = (): void => {
    document.title = t('app.title');
    document.documentElement.lang = getLang() === 'ua' ? 'uk' : 'ru';
    el('title').textContent = t('app.title');
    el('controls').textContent = t('hud.controls');
    el('seed').textContent = `${t('hud.seed')} ${seed}`;
    newOffice.textContent = t('hud.newOffice');
    roomName.textContent = room ? t(`room.${room}`) : t('room.corridor');
    drawTasks();
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
      handlers.onLangChange(button.dataset.lang as Lang);
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
    setTasks(value) {
      world = value;
      drawTasks();
    },
    shout(key, params) {
      shoutEl.textContent = t(key, params);
      shoutEl.hidden = false;
      shoutEl.classList.remove('pop');
      void shoutEl.offsetWidth;
      shoutEl.classList.add('pop');
      window.clearTimeout(shoutTimer);
      shoutTimer = window.setTimeout(() => (shoutEl.hidden = true), 1600);
    },
  };
}
