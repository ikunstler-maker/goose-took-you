import { getLang, setLang, t, type Lang } from '../i18n';
import type { RoomType } from '../sim/prefabs';
import { taskProgress } from '../sim/tasks';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';

export interface Hud {
  setRoom(type: RoomType | null): void;
  setSeed(seed: number): void;
  /** Redraws the task list, the shared progress bar and the interaction prompt. */
  setTasks(world: WorldState): void;
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function createHud(handlers: { onNewOffice(): void; onLangChange(): void }): Hud {
  const roomName = el('room-name');
  const newOffice = el<HTMLButtonElement>('new-office');
  const langButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#lang button'));
  const progressLabel = document.querySelector('#progress span') as HTMLElement;
  const progressFill = document.querySelector('#progress .fill') as HTMLElement;
  const tasksTitle = document.querySelector('#tasks h2') as HTMLElement;
  const tasksList = document.querySelector('#tasks ul') as HTMLElement;
  const prompt = el('prompt');
  let room: RoomType | null = null;
  let seed = 0;
  let dimTimer = 0;
  let world: WorldState | null = null;

  const drawTasks = (): void => {
    if (!world) return;
    const { tasks, stations, level } = world;
    const progress = taskProgress(tasks);
    progressLabel.textContent = progress >= 1 ? t('hud.allDone') : t('hud.progress');
    progressFill.style.width = `${progress * 100}%`;
    tasksTitle.textContent = t('hud.tasks');
    const items = tasks
      .filter((task) => task.owner === LOCAL_PLAYER)
      .map((task) => {
        const li = document.createElement('li');
        const roomType = level.rooms[stations[task.station]!.room]!.type;
        li.textContent = t('task.where', { task: t(`task.${task.kind}`), room: t(`room.${roomType}`) });
        li.classList.toggle('done', task.done);
        return li;
      });
    tasksList.replaceChildren(...items);
    const reach = world.activeTask === null ? world.reachableTask : null;
    prompt.hidden = reach === null;
    if (reach !== null) prompt.textContent = t('hud.interact', { key: 'E', task: t(`task.${tasks[reach]!.kind}`) });
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
    setTasks(value) {
      world = value;
      drawTasks();
    },
  };
}
