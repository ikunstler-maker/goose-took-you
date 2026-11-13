import { STICK_DEADZONE, STICK_FLICK, STICK_RADIUS } from '../config';
import { t } from '../i18n';
import { tagTarget } from '../sim/professions';
import { skillActive } from '../sim/roulette';
import { me, type WorldState } from '../sim/world';

/** What a touch button asks for; `main.ts` turns it into the same sim command a key would send. */
export type TouchAction = 'interact' | 'report' | 'pack' | 'overheat' | 'call' | 'skill';

export interface TouchControls {
  /** Shows the buttons that make sense right now; cheap to call every frame. */
  update(world: WorldState): void;
  /** Lets go of the stick (a meeting started, the match ended). */
  reset(): void;
  relabel(): void;
}

let touchMode = false;

/** True once the game is played with fingers: a phone or tablet, or the first touch on a touch laptop. */
export const isTouch = (): boolean => touchMode;

/** How a prompt names the control for an action: the key on a keyboard, the button's caption on a touch screen. */
export function keyName(action: 'interact' | 'report' | 'pack'): string {
  if (!touchMode) return action === 'interact' ? 'E' : action === 'report' ? 'R' : 'Q';
  return `«${t(action === 'interact' ? 'touch.act' : action === 'report' ? 'touch.report' : 'touch.pack')}»`;
}

/**
 * Thumb controls: a floating stick on the left half of the screen, action buttons
 * on the right, pinch to zoom. Vectors are screen-relative: right and up.
 */
export function createTouchControls(
  canvas: HTMLCanvasElement,
  handlers: {
    onMove(right: number, up: number): void;
    /** The stick was pushed out from rest: used to pick a rug while hiding. */
    onFlick(right: number, up: number): void;
    onAction(action: TouchAction): void;
    onZoom(factor: number): void;
    /** Touch mode switched on after the page loaded. */
    onEnable(): void;
  },
): TouchControls {
  const root = document.getElementById('touch') as HTMLElement;
  const base = document.createElement('div');
  base.className = 'stick';
  const knob = document.createElement('i');
  base.append(knob);
  base.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'actions';
  // The main button sits in the corner under the thumb; the rest fan out from it.
  const ORDER: TouchAction[] = ['interact', 'report', 'pack', 'skill', 'overheat', 'call'];
  const buttons = new Map<TouchAction, HTMLButtonElement>();
  for (const action of ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `act act-${action}`;
    b.hidden = true;
    // pointerdown, not click: no delay, and the thumb may already be sliding away.
    b.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!b.disabled) handlers.onAction(action);
    });
    buttons.set(action, b);
    actions.append(b);
  }
  root.append(base, actions);

  const enable = (): void => {
    if (touchMode) return;
    touchMode = true;
    document.documentElement.classList.add('touch');
    handlers.onEnable();
  };
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    touchMode = true;
    document.documentElement.classList.add('touch');
  }

  // --- Stick and pinch: every finger on the canvas is tracked here ---
  const fingers = new Map<number, { x: number; y: number }>();
  let stickId = -1;
  let originX = 0;
  let originY = 0;
  let pushed = false;
  let pinch = 0;
  let lastRight = 0;
  let lastUp = 0;

  const setMove = (right: number, up: number): void => {
    if (right === lastRight && up === lastUp) return;
    lastRight = right;
    lastUp = up;
    handlers.onMove(right, up);
  };
  const dropStick = (): void => {
    stickId = -1;
    pushed = false;
    base.hidden = true;
    setMove(0, 0);
  };
  const spread = (): number => {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    enable();
    event.preventDefault();
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 2 && !pushed) {
      // A second finger before the stick was pushed: this is a pinch, not a walk.
      dropStick();
      pinch = spread();
      return;
    }
    if (stickId < 0 && pinch === 0 && event.clientX < window.innerWidth / 2) {
      stickId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      base.hidden = false;
      base.style.left = `${originX}px`;
      base.style.top = `${originY}px`;
      knob.style.transform = '';
    }
  });
  window.addEventListener('pointermove', (event) => {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    finger.x = event.clientX;
    finger.y = event.clientY;
    if (pinch > 0 && fingers.size >= 2) {
      const now = spread();
      if (now > 10) {
        handlers.onZoom(pinch / now);
        pinch = now;
      }
      return;
    }
    if (event.pointerId !== stickId) return;
    const dx = finger.x - originX;
    const dy = finger.y - originY;
    const length = Math.hypot(dx, dy);
    const reach = Math.min(1, length / STICK_RADIUS);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    knob.style.transform = `translate(${nx * reach * STICK_RADIUS}px, ${ny * reach * STICK_RADIUS}px)`;
    if (reach < STICK_DEADZONE) {
      pushed = false;
      setMove(0, 0);
      return;
    }
    // Sixteen directions are plenty and keep the command stream short.
    const angle = Math.round(Math.atan2(-ny, nx) / (Math.PI / 8)) * (Math.PI / 8);
    const right = Math.round(Math.cos(angle) * 1000) / 1000;
    const up = Math.round(Math.sin(angle) * 1000) / 1000;
    if (!pushed && reach >= STICK_FLICK) {
      pushed = true;
      handlers.onFlick(right, up);
    }
    setMove(right, up);
  });
  const lift = (event: PointerEvent): void => {
    if (!fingers.delete(event.pointerId)) return;
    if (event.pointerId === stickId) dropStick();
    if (fingers.size < 2) pinch = 0;
  };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  // A long press must not open the browser's menu over the game.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  let shown = '';
  let lastWorld: WorldState | null = null;
  const draw = (world: WorldState, force = false): void => {
    lastWorld = world;
    const self = me(world);
    const playing = touchMode && world.phase === 'play' && self.alive && self.activeTask === null && !self.watching;
    const goose = playing && self.role === 'goose';
    const hidden = playing && self.under !== null;
    const wait = Math.ceil(world.sabotageCooldown);
    const packWait = Math.ceil(self.packCooldown);
    // The profession's button: the Analyst's pixel and the Team Lead's tablet are pressed; a SysAdmin sees its dust timer.
    const job = !playing ? null : self.role === 'goose' ? 'goose' : self.profession;
    const trick = skillActive(self);
    const skillShown = job === 'analyst' || job === 'lead' || (job === 'sysadmin' && hidden) || (job === 'goose' && !hidden);
    const skillWait =
      job === 'analyst' || (job === 'goose' && !trick) ? Math.ceil(self.skillCooldown) : job === 'sysadmin' ? Math.max(0, Math.ceil(self.ductLeft)) : 0;
    const skillReady =
      job === 'analyst'
        ? skillWait === 0 && tagTarget(world, self) !== null
        : job === 'lead'
          ? self.charged && self.tablet === 0
          : job === 'goose'
            ? (skillWait === 0 && !trick) || (self.disguise !== null && self.glitch === 0)
            : false;
    const state = [
      job,
      skillShown,
      skillWait,
      skillReady,
      playing,
      playing && (hidden || self.prompt !== null),
      playing && !hidden && self.canReport !== null,
      goose && !hidden && self.canPack !== null,
      packWait,
      goose,
      world.sabotage !== null,
      wait,
    ].join();
    if (state === shown && !force) return;
    shown = state;
    root.hidden = !playing;
    if (!playing) return;
    const set = (action: TouchAction, visible: boolean, text: string, disabled = false): void => {
      const b = buttons.get(action)!;
      b.hidden = !visible;
      b.disabled = disabled;
      b.textContent = text;
    };
    set('interact', hidden || self.prompt !== null, t('touch.act'));
    set('report', !hidden && self.canReport !== null, t('touch.report'));
    set('pack', goose && !hidden && self.canPack !== null, packWait > 0 ? t('touch.wait', { seconds: packWait }) : t('touch.pack'), packWait > 0);
    const blocked = world.sabotage !== null || wait > 0;
    const suffix = wait > 0 && !world.sabotage ? ` ${wait}` : '';
    set('overheat', goose, t('touch.overheat') + suffix, blocked);
    set('call', goose, t('touch.call') + suffix, blocked);
    if (job) set('skill', skillShown, t(`skill.${job}`) + (skillWait > 0 ? ` ${skillWait}` : ''), !skillReady);
    else set('skill', false, '');
  };

  root.hidden = true;
  return {
    update: (world) => draw(world),
    reset() {
      fingers.clear();
      pinch = 0;
      dropStick();
    },
    relabel() {
      if (lastWorld) draw(lastWorld, true);
    },
  };
}
