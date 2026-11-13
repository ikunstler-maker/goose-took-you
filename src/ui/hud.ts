import { getLang, setLang, t, type I18nKey, type Lang } from '../i18n';
import type { RoomType } from '../sim/prefabs';
import type { Task } from '../sim/tasks';
import { fixesNeeded } from '../sim/sabotage';
import { LOCAL_PLAYER, me, progress, type WorldState } from '../sim/world';
import { isTouch, keyName } from './touch';

export interface Hud {
  setRoom(type: RoomType | null): void;
  setSeed(seed: number): void;
  /** Redraws the task list, the shared progress bar and the interaction prompt. */
  setTasks(world: WorldState): void;
  /** Short shout bubble in the middle of the screen, e.g. a slipping box. */
  shout(key: I18nKey, params?: Record<string, string | number>): void;
  /** Sabotage banner with its countdown and the Goose's sabotage line; cheap to call every frame. */
  setAlarm(world: WorldState): void;
}

const STALE = '\u0000';

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
  const alarm = el('alarm');
  const alarmTitle = alarm.querySelector('strong') as HTMLElement;
  const alarmText = alarm.querySelector('span') as HTMLElement;
  const alarmFill = alarm.querySelector('.fill') as HTMLElement;
  const sabotageLine = document.querySelector('#tasks .sabotage') as HTMLElement;
  let alarmShown = '';
  let sabotageShown = '';
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
    const own = tasks.filter((task) => task.owner === LOCAL_PLAYER);
    tasksTitle.textContent = t('hud.tasksCount', {
      title: goose ? t('hud.tasksFake') : t('hud.tasks'),
      done: own.filter((task) => task.done).length,
      count: own.length,
    });
    el('controls').textContent = goose ? t('hud.controlsGoose') : t('hud.controls');
    const items = own.map((task) => {
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
    if (w.phase !== 'play' || self.activeTask !== null || self.watching || !self.alive) return '';
    if (self.under !== null) return t(isTouch() ? 'hud.carpetUnderTouch' : 'hud.carpetUnder', { key: keyName('interact') });
    const lines: string[] = [];
    if (self.canPack !== null) {
      lines.push(self.packCooldown > 0 ? t('hud.packWait', { seconds: Math.ceil(self.packCooldown) }) : t('hud.pack', { key: keyName('pack') }));
    }
    if (self.canReport !== null) lines.push(t('hud.report', { key: keyName('report') }));
    const main = mainPrompt(w);
    if (main) lines.unshift(main);
    return lines.join(' · ');
  };

  const mainPrompt = (w: WorldState): string => {
    const self = me(w);
    const p = self.prompt;
    if (p?.kind === 'fix' && w.sabotage) return t(`hud.fix.${w.sabotage.kind}`, { key: keyName('interact') });
    if (p?.kind === 'task') return t('hud.interact', { key: keyName('interact'), task: t(`task.${w.tasks[p.task]!.kind}`) });
    if (p?.kind === 'pickup') return t('hud.pickup', { key: keyName('interact') });
    if (p?.kind === 'deliver') return t('hud.deliver', { key: keyName('interact') });
    if (p?.kind === 'button') return t('hud.button', { key: keyName('interact') });
    if (p?.kind === 'cameras') return t('hud.cameras', { key: keyName('interact') });
    if (p?.kind === 'carpet') return t('hud.carpetIn', { key: keyName('interact') });
    if (self.carrying !== null) {
      const box = w.boxes.find((b) => b.id === self.carrying);
      return box ? t('hud.carrying', { hint: cargoHint(w.tasks[box.task]!) }) : '';
    }
    return '';
  };

  const drawAlarm = (w: WorldState): void => {
    const s = w.phase === 'play' ? w.sabotage : null;
    const text = s
      ? t(`sabotage.${s.kind}Hint`, { done: s.done.length, need: fixesNeeded(w, s.kind), seconds: Math.max(0, Math.ceil(s.left)) })
      : '';
    if (text !== alarmShown) {
      alarmShown = text;
      alarm.hidden = !s;
      if (s) {
        alarmTitle.textContent = t(`sabotage.${s.kind}`);
        alarmText.textContent = text;
      }
    }
    if (s) alarmFill.style.width = `${Math.max(0, (s.left / s.total) * 100)}%`;
    const self = me(w);
    const line =
      w.phase !== 'play' || self.role !== 'goose' || !self.alive
        ? ''
        : w.sabotage
          ? t('hud.sabotage.active')
          : w.sabotageCooldown > 0
            ? t('hud.sabotage.wait', { seconds: Math.ceil(w.sabotageCooldown) })
            : t('hud.sabotage.ready');
    if (line !== sabotageShown) {
      sabotageShown = line;
      sabotageLine.textContent = line;
      sabotageLine.hidden = line === '';
    }
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
    // A value no text can equal, so the next draw always repaints (and hides a stale banner).
    alarmShown = STALE;
    sabotageShown = STALE;
    if (world) drawAlarm(world);
    for (const button of langButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === getLang()));
    }
  };

  // On a phone the task list folds into its title; a tap opens it.
  const tasksPanel = el('tasks');
  tasksTitle.addEventListener('click', () => tasksPanel.classList.toggle('open'));

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
    setAlarm(value) {
      world = value;
      drawAlarm(value);
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
