# Game server

An ordinary Node process that keeps online rooms in memory and runs the same
rules as the browser (`src/sim/`). Nothing is stored; a room is gone once
everyone has left. No accounts, no secrets.

- `room.ts` — one room: seats, host, commands in, snapshots out. Host-agnostic, unit-tested.
- `index.ts` — HTTP + WebSocket wrapper: room codes, limits, the clock. The only host-specific part.
- `config.ts` — tunables (send rate, room limit, flood limits).

## Run locally
`npm run build:server && npm start` (port 8787), then open the site on
`localhost` with `?server=ws://localhost:8787`.

## Settings (host environment, not secret)
- `PORT` — set by the host.
- `ALLOWED_ORIGINS` — comma-separated site addresses allowed to connect; empty allows any.
- Site side: `VITE_SERVER_URL` (e.g. `wss://<name>.onrender.com`) at build time; empty hides online play.

## Moving to another host
Only `index.ts` and `render.yaml` are tied to the host. Write a new wrapper
around `Room`, point `VITE_SERVER_URL` at it.
