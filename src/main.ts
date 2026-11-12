import { TICK } from './config';
import { createMinigameHost } from './minigames/host';
import { createChick } from './render/chick';
import { createTaskMarkers, type TaskMarkers } from './render/markers';
import { buildOffice, type OfficeView } from './render/office';
import { createStage } from './render/stage';
import { applyCommand, createWorld, step, type Command, type SimEvent, type WorldState } from './sim/world';
import { createHud } from './ui/hud';

const stage = createStage(document.getElementById('game') as HTMLCanvasElement);
const chick = createChick();
stage.scene.add(chick.root);

let world: WorldState;
let office: OfficeView | null = null;
let markers: TaskMarkers | null = null;

function seedFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const value = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function randomSeed(): number {
  // Picking a seed is not gameplay: the sim itself only ever sees the seed.
  return 1 + Math.floor(Math.random() * 999_999);
}

function rebuildOffice(): void {
  if (office) {
    stage.scene.remove(office.root);
    office.dispose();
  }
  office = buildOffice(world.level);
  stage.scene.add(office.root);
  if (markers) {
    stage.scene.remove(markers.root);
    markers.dispose();
  }
  markers = createTaskMarkers(world);
  stage.scene.add(markers.root);
  stage.fitSun(world.level.size);
}

const hud = createHud({
  onNewOffice: () => startOffice(randomSeed()),
  // Decor signs carry text, so the office is redrawn in the new language.
  onLangChange: () => {
    rebuildOffice();
    minigames.relabel();
  },
});

const minigames = createMinigameHost({
  onWin: () => send({ type: 'finishTask' }),
  onCancel: () => send({ type: 'cancelTask' }),
});

function handle(events: SimEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'roomChanged':
        hud.setRoom(event.roomId === null ? null : world.level.rooms[event.roomId]!.type);
        break;
      case 'taskOpened':
        minigames.open(event.kind, event.seed);
        hud.setTasks(world);
        break;
      case 'taskClosed':
        hud.setTasks(world);
        markers?.refresh(world);
        break;
      case 'reachChanged':
        hud.setTasks(world);
        break;
      case 'bumped':
        break;
    }
  }
}

function send(command: Command): void {
  handle(applyCommand(world, command));
}

function startOffice(seed: number): void {
  minigames.close();
  world = createWorld(seed);
  rebuildOffice();
  stage.focus(world.player.x, world.player.z);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
  hud.setSeed(seed);
  hud.setRoom(world.roomId === null ? null : world.level.rooms[world.roomId]!.type);
  hud.setTasks(world);
}

// --- Input: screen-relative movement for the isometric camera ---
const held = new Set<string>();
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function sendMove(): void {
  let right = 0;
  let up = 0;
  for (const code of held) {
    const dir = KEYS[code];
    if (dir) {
      right += dir[0];
      up += dir[1];
    }
  }
  // Camera yaw is 45°: screen-right is (+x, -z), screen-up is (-x, -z).
  send({ type: 'move', x: right - up, z: -right - up });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE' && !event.repeat && !minigames.isOpen()) {
    send({ type: 'interact' });
    return;
  }
  if (!(event.code in KEYS)) return;
  event.preventDefault();
  held.add(event.code);
  sendMove();
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  sendMove();
});
window.addEventListener('blur', () => {
  held.clear();
  sendMove();
});
window.addEventListener('wheel', (event) => stage.zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1), { passive: true });

startOffice(seedFromUrl() ?? randomSeed());

// --- Loop: fixed-step simulation, free-running rendering ---
let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;
  while (accumulator >= TICK) {
    handle(step(world, TICK));
    minigames.tick(TICK);
    accumulator -= TICK;
  }

  const time = now / 1000;
  const player = world.player;
  chick.update(player.x, player.z, player.facing, player.moving, player.emotion, time, dt);
  if (office?.update(world, time, dt)) stage.refreshShadows();
  markers?.update(time);
  stage.follow(player.x, player.z, dt);
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for automated checks; carries no gameplay authority.
(window as unknown as { __goose: unknown }).__goose = { world: () => world };
