import { randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { CODE_ALPHABET, CODE_LENGTH, isCode, normalizeCode, type ClientMessage, type Refusal, type ServerMessage } from '../src/net/protocol';
import { CONNECTS_PER_MINUTE, EMPTY_ROOM_GRACE, FLOOD_LIMIT, MAX_MESSAGE, MESSAGE_BURST, MESSAGE_RATE, ROOM_LIMIT } from './config';
import { Room } from './room';

/**
 * The game server: an ordinary Node process that keeps rooms in memory.
 * Nothing is stored; a room is gone once everyone has left.
 * Settings come from the host's environment: PORT, ALLOWED_ORIGINS (comma-separated site addresses).
 */
const port = Number(process.env.PORT) || 8787;
const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

const rooms = new Map<string, Room>();

function newCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

const newRoom = (): Room => {
  const room = new Room(newCode(), () => 1 + randomInt(999_999), () => randomBytes(16).toString('hex'));
  rooms.set(room.code, room);
  return room;
};

const http = createServer((request, response) => {
  // The host pings this to see the process is alive; it also wakes a sleeping free instance.
  response.writeHead(request.url === '/healthz' || request.url === '/' ? 200 : 404, { 'content-type': 'text/plain' });
  response.end(`ok ${rooms.size}`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

/** Connections per address in the current minute. */
const connects = new Map<string, number>();
setInterval(() => connects.clear(), 60_000).unref();

http.on('upgrade', (request, socket, head) => {
  const origin = (request.headers.origin ?? '').replace(/\/$/, '');
  const forwarded = request.headers['x-forwarded-for'];
  const address = (typeof forwarded === 'string' ? forwarded.split(',')[0]!.trim() : '') || request.socket.remoteAddress || '?';
  const count = (connects.get(address) ?? 0) + 1;
  connects.set(address, count);
  if ((origins.length > 0 && !origins.includes(origin)) || count > CONNECTS_PER_MINUTE) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let peer = 0;
  let allowance = MESSAGE_BURST;
  let refilled = Date.now();
  let dropped = 0;
  let alive = true;

  const send = (message: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const refuse = (reason: Refusal): void => {
    send({ t: 'refused', reason });
    ws.close();
  };
  const enter = (target: Room, result: number | Refusal): void => {
    if (typeof result === 'string') {
      if (target.players === 0 && target.state.phase === 'lobby') rooms.delete(target.code);
      refuse(result);
      return;
    }
    room = target;
    peer = result;
  };

  ws.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) ws.terminate();
    alive = false;
    ws.ping();
  }, 25_000);

  ws.on('message', (data) => {
    const now = Date.now();
    allowance = Math.min(MESSAGE_BURST, allowance + ((now - refilled) / 1000) * MESSAGE_RATE);
    refilled = now;
    if (allowance < 1) {
      if (++dropped > FLOOD_LIMIT) ws.terminate();
      return;
    }
    allowance -= 1;

    let message: ClientMessage;
    try {
      message = JSON.parse(String(data)) as ClientMessage;
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;

    if (room) {
      room.receive(peer, message);
      return;
    }
    if (message.t === 'create') {
      if (rooms.size >= ROOM_LIMIT) refuse('busy');
      else {
        const created = newRoom();
        enter(created, created.join(send, message.look));
      }
    } else if (message.t === 'join' || message.t === 'rejoin') {
      const code = normalizeCode(String(message.code ?? ''));
      const target = isCode(code) ? rooms.get(code) : undefined;
      if (!target) refuse('noRoom');
      else enter(target, message.t === 'join' ? target.join(send, message.look) : target.rejoin(send, message.token));
    } else refuse('bad');
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    room?.drop(peer);
  });
  ws.on('error', () => ws.terminate());
});

// One clock for every room.
const STEP_MS = 50;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const seconds = (now - last) / 1000;
  last = now;
  for (const room of rooms.values()) {
    room.tick(seconds);
    if (room.emptyFor > EMPTY_ROOM_GRACE) rooms.delete(room.code);
  }
}, STEP_MS);

http.listen(port, () => console.log(`goose server on :${port}`));
