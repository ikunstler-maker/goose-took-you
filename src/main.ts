import { TICK } from './config';
import { createMinigameHost } from './minigames/host';
import { createBoxes } from './render/boxes';
import { createBroadcast, type BroadcastView } from './render/broadcast';
import { createChicks } from './render/chicks';
import { createTaskMarkers, type TaskMarkers } from './render/markers';
import { buildOffice, type OfficeView } from './render/office';
import { createStage } from './render/stage';
import { setLang } from './i18n';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Command, type SimEvent, type WorldState } from './sim/world';
import { createHud } from './ui/hud';
import { createLobby } from './ui/lobby';
import { loadSettings, saveSettings } from './ui/settings';

const settings = loadSettings();
setLang(settings.lang);

const stage = createStage(document.getElementById('game') as HTMLCanvasElement);
const chicks = createChicks();
stage.scene.add(chicks.root);
const boxes = createBoxes();
stage.scene.add(boxes.root);

let world: WorldState;
let office: OfficeView | null = null;
let markers: TaskMarkers | null = null;
let broadcast: BroadcastView | null = null;

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
  if (broadcast) {
    stage.scene.remove(broadcast.root);
    broadcast.dispose();
  }
  broadcast = createBroadcast(world.level);
  stage.scene.add(broadcast.root);
  stage.fitSun(world.level.size);
}

const hud = createHud({
  onNewOffice: () => startOffice(randomSeed()),
  // Decor signs carry text, so the office is redrawn in the new language.
  onLangChange: (lang) => {
    saveSettings({ lang });
    rebuildOffice();
    minigames.relabel();
    lobby.relabel();
  },
});

const lobby = createLobby({
  onLook: (color, accessory) => {
    saveSettings({ color, accessory });
    send({ type: 'setLook', color, accessory });
  },
  onStart: () => send({ type: 'start' }),
});

const minigames = createMinigameHost({
  onWin: () => send({ type: 'finishTask' }),
  onCancel: () => send({ type: 'cancelTask' }),
});

function handle(events: SimEvent[]): void {
  for (const event of events) {
    // The HUD and windows follow the local player; other participants act silently for now.
    if ('who' in event && event.who !== LOCAL_PLAYER) continue;
    switch (event.type) {
      case 'roomChanged':
        hud.setRoom(event.roomId === null ? null : world.level.rooms[event.roomId]!.type);
        break;
      case 'taskOpened':
        minigames.open(event.kind, event.seed);
        hud.setTasks(world);
        break;
      case 'looksChanged':
        chicks.rebuild(world);
        break;
      case 'started':
        lobby.hide();
        hud.setTasks(world);
        break;
      case 'taskClosed':
      case 'taskDone':
      case 'boxPicked':
      case 'promptChanged':
        hud.setTasks(world);
        markers?.refresh(world);
        break;
      case 'boxSlipped':
        hud.shout('cargo.slip');
        hud.setTasks(world);
        break;
      case 'bumped':
      case 'broadcastStarted':
        break;
    }
  }
}

function send(command: Command): void {
  handle(applyCommand(world, LOCAL_PLAYER, command));
}

function startOffice(seed: number): void {
  minigames.close();
  const look = loadSettings();
  world = createWorld(seed, { color: look.color, accessory: look.accessory });
  rebuildOffice();
  chicks.rebuild(world);
  lobby.show(me(world).color, me(world).accessory);
  stage.focus(me(world).x, me(world).z);
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
  hud.setSeed(seed);
  const roomId = me(world).roomId;
  hud.setRoom(roomId === null ? null : world.level.rooms[roomId]!.type);
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
  const player = me(world);
  chicks.update(world, time, dt);
  if (office?.update(world, time, dt)) stage.refreshShadows();
  markers?.update(time);
  boxes.update(world, time);
  broadcast?.update(world.broadcast, time);
  stage.follow(player.x, player.z, dt);
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for automated checks; carries no gameplay authority.
(window as unknown as { __goose: unknown }).__goose = { world: () => world };
