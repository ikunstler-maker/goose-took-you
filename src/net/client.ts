import type { ClientMessage, PlayerCommand, Refusal, ServerMessage, WireView } from './protocol';
import type { SimEvent } from '../sim/world';

export type OnlineStatus = 'connecting' | 'online' | 'reconnecting';

export interface OnlineHandlers {
  onStatus(status: OnlineStatus): void;
  /** Seated: a fresh match copy must be built from the next snapshot. */
  onRoom(info: { code: string; you: number; host: number; players: number }): void;
  onRoster(info: { host: number; players: number }): void;
  /** The merged snapshot, which parts just changed, and what happened meanwhile. */
  onState(view: WireView, changed: Partial<WireView>, events: SimEvent[]): void;
  /** The server said no, or the connection is gone for good. */
  onEnd(reason: Refusal | 'lost'): void;
}

export interface Online {
  send(command: PlayerCommand): void;
  again(): void;
  close(): void;
}

const RETRIES = 5;
const RETRY_MS = 2000;

/** Where the game server lives: set at build time by the site's host; empty means no online play. */
export function serverUrl(): string {
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // On a developer's machine the address may come from the link, for testing.
  const fromLink = local ? new URLSearchParams(window.location.search).get('server') : null;
  return fromLink ?? import.meta.env.VITE_SERVER_URL ?? '';
}

/** Opens a room (or joins one) and keeps the connection, coming back to the same seat after a hiccup. */
export function connect(url: string, first: ClientMessage, handlers: OnlineHandlers): Online {
  let socket: WebSocket | null = null;
  let closed = false;
  let seat: { code: string; token: string } | null = null;
  let retries = 0;
  let view: Partial<WireView> = {};

  const end = (reason: Refusal | 'lost'): void => {
    if (closed) return;
    closed = true;
    socket?.close();
    handlers.onEnd(reason);
  };

  const open = (hello: ClientMessage): void => {
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify(hello)));
    ws.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === 'room') {
        seat = { code: message.code, token: message.token };
        retries = 0;
        view = {};
        handlers.onStatus('online');
        handlers.onRoom(message);
      } else if (message.t === 'roster') handlers.onRoster(message);
      else if (message.t === 'state') {
        Object.assign(view, message.v);
        // The first snapshot after seating carries every part.
        if (view.seats && view.self && view.sight !== undefined) handlers.onState(view as WireView, message.v, message.e);
      } else if (message.t === 'refused') end(message.reason);
    });
    ws.addEventListener('close', () => {
      if (closed || socket !== ws) return;
      // Never seated, or out of tries: give up. Otherwise ask for the same seat again.
      if (!seat || retries >= RETRIES) {
        end('lost');
        return;
      }
      retries++;
      handlers.onStatus('reconnecting');
      const back = seat;
      window.setTimeout(() => {
        if (!closed) open({ t: 'rejoin', code: back.code, token: back.token });
      }, RETRY_MS);
    });
  };

  handlers.onStatus('connecting');
  open(first);

  const post = (message: ClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  return {
    send: (command) => post({ t: 'cmd', c: command }),
    again: () => post({ t: 'again' }),
    close: () => {
      closed = true;
      socket?.close();
    },
  };
}
