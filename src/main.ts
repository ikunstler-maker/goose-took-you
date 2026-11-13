import { ALARM_EVERY, HEARING_RANGE, KNOCK_EVERY, STEP_EVERY, TELL_VISIBLE_RANGE, TICK } from './config';
import { createSound, type SoundName } from './audio/sound';
import { createMinigameHost } from './minigames/host';
import { createBoxes } from './render/boxes';
import { createBroadcast, type BroadcastView } from './render/broadcast';
import { createConfetti } from './render/confetti';
import { createCarpets, type CarpetsView } from './render/carpets';
import { createChicks } from './render/chicks';
import { createTaskMarkers, type TaskMarkers } from './render/markers';
import { buildOffice, type OfficeView } from './render/office';
import { createStage } from './render/stage';
import { setLang, t, type I18nKey } from './i18n';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Command, type Role, type SimEvent, type WorldState } from './sim/world';
import { linkToward } from './sim/carpets';
import { createHud } from './ui/hud';
import { createMinimap } from './ui/minimap';
import { createCameraScreen } from './ui/cameras';
import { createLobby } from './ui/lobby';
import { createMatchScreens } from './ui/match';
import { createMeetingView } from './ui/meeting';
import { loadSettings, saveSettings } from './ui/settings';
import { createSoundControls } from './ui/soundControls';
import { createTouchControls, isTouch } from './ui/touch';

const settings = loadSettings();
setLang(settings.lang);

const sound = createSound(settings.volume, settings.muted);
const soundControls = createSoundControls(settings, {
  onChange: (volume, muted) => {
    sound.setVolume(volume);
    sound.setMuted(muted);
    saveSettings({ volume, muted });
    sound.play('click');
  },
});
// Browsers keep audio silent until the first click or key press.
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
window.addEventListener('keydown', () => sound.unlock(), { capture: true });
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('button')) sound.play('click');
});

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
const chicks = createChicks();
stage.scene.add(chicks.root);
const boxes = createBoxes();
stage.scene.add(boxes.root);

let world: WorldState;
let office: OfficeView | null = null;
let markers: TaskMarkers | null = null;
let broadcast: BroadcastView | null = null;
let carpets: CarpetsView | null = null;

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
  if (carpets) {
    stage.scene.remove(carpets.root);
    carpets.dispose();
  }
  carpets = createCarpets(world);
  stage.scene.add(carpets.root);
  stage.fitSun(world.level.size);
}

const confetti = createConfetti();
stage.scene.add(confetti.root);
const minimap = createMinimap();
const cameras = createCameraScreen(() => send({ type: 'stopWatching' }));
const hud = createHud({
  onNewOffice: () => startOffice(randomSeed()),
  // Decor signs carry text, so the office is redrawn in the new language.
  onLangChange: (lang) => {
    saveSettings({ lang });
    rebuildOffice();
    minigames.relabel();
    cameras.relabel();
    lobby.relabel();
    screens.relabel(world);
    meeting.relabel();
    soundControls.relabel();
    touch.relabel();
  },
});

const screens = createMatchScreens({ onNewMatch: () => startOffice(randomSeed()) });

const lobby = createLobby({
  onLook: (color, accessory) => {
    saveSettings({ color, accessory });
    send({ type: 'setLook', color, accessory });
  },
  onStart: () => send({ type: 'start' }),
});

const meeting = createMeetingView({
  onVote: (target) => send({ type: 'vote', target }),
  onSay: (kind, about, room) => send({ type: 'say', kind, about, room }),
});

const minigames = createMinigameHost({
  onWin: () => send({ type: 'finishTask' }),
  onCancel: () => send({ type: 'cancelTask' }),
  onSound: (name) => sound.play(name),
});

/** How loud something at (x, z) is for the player: silent when out of sight or too far. */
function loudness(x: number, z: number): number {
  const self = me(world);
  const { size } = world.level;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= size || cz >= size || world.sight[LOCAL_PLAYER]!.cells[cz * size + cx] !== 1) return 0;
  return Math.max(0, 1 - Math.hypot(x - self.x, z - self.z) / HEARING_RANGE);
}

/** Sounds of what participants do: the player's own at full volume, others' by sight and distance. */
const ACTION_SOUNDS: Partial<Record<SimEvent['type'], SoundName>> = {
  bumped: 'bonk',
  boxPicked: 'pickup',
  boxSlipped: 'slip',
  packed: 'pack',
  carpet: 'carpet',
  sabotageFixed: 'fix',
};
/** Sounds everyone hears wherever they are. */
const OFFICE_SOUNDS: Partial<Record<SimEvent['type'], SoundName>> = {
  reported: 'report',
  meetingStarted: 'meeting',
  chat: 'chat',
  voted: 'vote',
  broadcastStarted: 'news',
};

function hear(event: SimEvent): void {
  const office = OFFICE_SOUNDS[event.type];
  if (office) sound.play(office);
  const action = ACTION_SOUNDS[event.type];
  if (action && 'who' in event) {
    const actor = world.participants[event.who]!;
    const packedMe = event.type === 'packed' && event.victim === LOCAL_PLAYER;
    sound.play(action, event.who === LOCAL_PLAYER || packedMe ? 1 : loudness(actor.x, actor.z));
  }
  if (event.type === 'sabotageEnded' && event.fixed) sound.play('fixed');
  if (event.type === 'newsLaunched') {
    // Confetti and cheers reach whoever is close enough to see the button.
    confetti.burst(event.x, event.z);
    const gain = event.who === LOCAL_PLAYER ? 1 : loudness(event.x, event.z);
    sound.play('splash', gain);
    sound.play('ovation', gain);
  }
  if (event.type === 'taskOpened' && event.who === LOCAL_PLAYER) sound.play('open');
  // A delivered box pays out like a won mini-game; window games ring when their own window closes.
  if (event.type === 'taskDone' && event.who === LOCAL_PLAYER && world.tasks[event.taskId]!.kind === 'cargo') sound.play('jackpot');
  if (event.type === 'gameOver') {
    sound.play((event.winner === 'goose') === (me(world).role === 'goose') ? 'win' : 'lose');
  }
}

let stepIn = 0;
let knockIn = 0;
let alarmIn = 0;
const tellHeard = new Map<number, boolean>();

/** Sounds that follow the state rather than one event: steps, the knocking box, the alarm, «га-га». */
function ambience(dt: number): void {
  const self = me(world);
  const playing = world.phase === 'play';
  stepIn -= dt;
  if (playing && self.moving && stepIn <= 0) {
    sound.play('step');
    stepIn = STEP_EVERY;
  }
  knockIn -= dt;
  if (playing && self.moving && self.carrying !== null && knockIn <= 0) {
    sound.play('knock');
    knockIn = KNOCK_EVERY;
  }
  alarmIn -= dt;
  if (playing && world.sabotage && alarmIn <= 0) {
    sound.play('alarm', 0.6);
    alarmIn = ALARM_EVERY;
  }
  for (const p of world.participants) {
    if (p.role !== 'goose') continue;
    const stretching = playing && p.alive && p.tell > 0 && p.under === null;
    if (stretching && !tellHeard.get(p.id)) {
      // The Goose hears its own neck; chicks only from close by and in plain sight.
      const near = Math.hypot(p.x - self.x, p.z - self.z) <= TELL_VISIBLE_RANGE;
      sound.play('honk', p === self ? 0.5 : near ? loudness(p.x, p.z) : 0);
    }
    tellHeard.set(p.id, stretching);
  }
}

function handle(events: SimEvent[]): void {
  for (const event of events) {
    hear(event);
    // Anyone's finished task moves the shared bar.
    if (event.type === 'taskDone') {
      hud.setTasks(world);
      markers?.refresh(world);
    }
    // A report is news for the whole office, whoever made it.
    if (event.type === 'reported') {
      hud.shout('hud.reported', { color: t(`look.color.${world.participants[event.victim]!.color}` as I18nKey) });
    }
    if (event.type === 'meetingStarted') {
      minigames.close();
      dropInput();
      hud.setTasks(world);
      markers?.refresh(world);
    }
    if (event.type === 'meetingEnded') {
      meeting.hide();
      hud.setTasks(world);
      markers?.refresh(world);
      if (event.ejected === LOCAL_PLAYER) screens.showPacked(world);
    }
    // Sabotages concern everyone, whoever started or fixed them.
    if (event.type === 'sabotageStarted' || event.type === 'sabotageFixed' || event.type === 'sabotageEnded') {
      hud.setTasks(world);
      markers?.refresh(world);
      if (event.type === 'sabotageEnded' && event.fixed) hud.shout(`sabotage.fixed.${event.kind}`);
    }
    if (event.type === 'packed') {
      const box = world.boxes.find((b) => b.id === event.boxId);
      if (box) cameras.packed(world, box.x, box.z);
      if (event.victim === LOCAL_PLAYER) {
        minigames.close();
        screens.showPacked(world);
      } else if (event.who === LOCAL_PLAYER) hud.shout('hud.packedDone');
      hud.setTasks(world);
    }
    // The rest of the HUD and windows follow the local player.
    if ('who' in event && event.who !== LOCAL_PLAYER) continue;
    switch (event.type) {
      case 'roomChanged':
        hud.setRoom(event.roomId === null ? null : world.level.rooms[event.roomId]!.type);
        break;
      case 'camerasOpened':
        cameras.open(world);
        hud.setTasks(world);
        break;
      case 'camerasClosed':
        cameras.close();
        hud.setTasks(world);
        break;
      case 'taskOpened':
        minigames.open(event.kind, event.seed);
        hud.setTasks(world);
        break;
      case 'looksChanged':
        chicks.rebuild(world);
        break;
      case 'started':
        // Roles are dealt at the start: the player's own Goose swaps to its true model.
        chicks.rebuild(world);
        lobby.hide();
        screens.showRole(world);
        markers?.refresh(world);
        hud.setTasks(world);
        break;
      case 'gameOver':
        minigames.close();
        cameras.close();
        meeting.hide();
        dropInput();
        screens.showOver(world);
        break;
      case 'rushStarted':
        hud.setTasks(world);
        markers?.refresh(world);
        break;
      case 'rushFailed':
        sound.play('bonk');
        hud.shout('hud.rushFailed');
        hud.setTasks(world);
        markers?.refresh(world);
        break;
      case 'newsLaunched':
        hud.shout('hud.newsLaunched');
        hud.setTasks(world);
        break;
      case 'badgeTaken':
        sound.play('click');
        hud.shout('hud.badgeTaken');
        hud.setTasks(world);
        markers?.refresh(world);
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
      case 'carpet':
        hud.setTasks(world);
        break;
      case 'bumped':
      case 'sabotageFixed':
      case 'broadcastStarted':
      case 'meetingStarted':
      case 'meetingStage':
      case 'meetingEnded':
      case 'chat':
      case 'voted':
        break;
    }
  }
}

function send(command: Command): void {
  handle(applyCommand(world, LOCAL_PLAYER, command));
}

/** `?role=goose|chick` fixes the player's role for testing; otherwise it is random. */
function roleFromUrl(): Role | null {
  const raw = new URLSearchParams(window.location.search).get('role');
  return raw === 'goose' || raw === 'chick' ? raw : null;
}

function startOffice(seed: number): void {
  minigames.close();
  meeting.hide();
  screens.hideAll();
  const look = loadSettings();
  world = createWorld(seed, { color: look.color, accessory: look.accessory }, roleFromUrl());
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

function crawlToward([right, up]: [number, number]): void {
  const self = me(world);
  const from = world.carpets[self.under!]!;
  const to = linkToward(world.carpets, from, right - up, -right - up);
  if (to !== null) send({ type: 'crawl', to });
}

/** Thumb stick direction on a touch screen, screen-relative; adds to the keys. */
const stick: [number, number] = [0, 0];

function sendMove(): void {
  let right = stick[0];
  let up = stick[1];
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

const touch = createTouchControls(canvas, {
  onMove: (right, up) => {
    stick[0] = right;
    stick[1] = up;
    if (me(world).under === null) sendMove();
  },
  // Under a rug a push of the stick picks the linked rug that lies that way.
  onFlick: (right, up) => {
    if (me(world).under !== null) crawlToward([right, up]);
  },
  onAction: (action) => {
    if (minigames.isOpen()) return;
    if (action === 'overheat' || action === 'call') send({ type: 'sabotage', kind: action });
    else send({ type: action });
    sound.play('click');
  },
  onZoom: (factor) => stage.zoomBy(factor),
  onEnable: () => {
    stage.setTouch(true);
    hud.setTasks(world);
  },
});
stage.setTouch(isTouch());

function dropInput(): void {
  held.clear();
  stick[0] = 0;
  stick[1] = 0;
  touch.reset();
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE' && !event.repeat && !minigames.isOpen()) {
    send({ type: 'interact' });
    return;
  }
  if (event.code === 'KeyQ' && !event.repeat && !minigames.isOpen()) {
    send({ type: 'pack' });
    return;
  }
  if ((event.code === 'Digit1' || event.code === 'Digit2') && !event.repeat && !minigames.isOpen()) {
    send({ type: 'sabotage', kind: event.code === 'Digit1' ? 'overheat' : 'call' });
    return;
  }
  if (event.code === 'KeyR' && !event.repeat && !minigames.isOpen()) {
    send({ type: 'report' });
    return;
  }
  if (!(event.code in KEYS)) return;
  event.preventDefault();
  if (me(world).under !== null) {
    // Under a rug the movement keys pick the linked rug that lies that way on screen.
    if (!event.repeat) crawlToward(KEYS[event.code]!);
    return;
  }
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
    // The pack countdown in the prompt ticks down by itself.
    if (world.tick % 15 === 0 && (me(world).canPack !== null || world.tasks.some((task) => task.owner === LOCAL_PLAYER && task.rush > 0))) hud.setTasks(world);
    accumulator -= TICK;
  }

  if (world.phase === 'meeting') meeting.update(world);
  hud.setAlarm(world);
  minimap.update(world);
  cameras.update(world, dt);
  touch.update(world);
  stage.setGloom(world.sabotage?.kind === 'overheat' && world.phase === 'play' ? 1 : 0, dt);

  ambience(dt);
  const time = now / 1000;
  const player = me(world);
  chicks.update(world, time, dt);
  if (office?.update(world, time, dt)) stage.refreshShadows();
  markers?.update(time);
  boxes.update(world, time);
  broadcast?.update(world.broadcast, time);
  confetti.update(dt);
  carpets?.update(world, time);
  stage.follow(player.x, player.z, dt);
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for automated checks; carries no gameplay authority.
(window as unknown as { __goose: unknown }).__goose = {
  world: () => world,
  /** Lets automated checks act as any participant through the normal command path. */
  send: (who: number, command: Command) => handle(applyCommand(world, who, command)),
  /** Fast-forwards the match through the normal step-and-handle path. */
  advance: (seconds: number) => {
    for (let t = 0; t < seconds && world.phase !== 'over'; t += TICK) handle(step(world, TICK));
  },
};
