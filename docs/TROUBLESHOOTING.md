# Troubleshooting

Solved problems: symptom → root cause → fix. Read by grep, never whole. Rules: `docs/MASTER_GUIDE.md`, Part A2.

Entry format (≤8 lines):

```
### <short title>
- Symptom: <exact error text or behaviour, searchable>
- Root cause: <one or two lines>
- Fix: <what to do; file/command>
- Verify: <command or check>
- Seen: YYYY-MM-DD
```

## Env

### Never restore a file with `git checkout` while it has uncommitted work
- Symptom: temporary debug edits need undoing in a file that also holds uncommitted changes.
- Root cause: `git checkout <file>` drops all uncommitted work in it, not only the debug lines.
- Fix: copy the file to the scratchpad first and copy it back; or commit before instrumenting.
- Verify: `git status --short` still lists the file as modified.
- Seen: 2026-11-12

### PR cannot be opened in an empty repository
- Symptom: repository has no branches; `git ls-remote origin` prints nothing; no base branch for a PR.
- Root cause: GitHub needs an existing base branch that shares history with the head branch.
- Fix: with the owner's permission push one empty commit to `main` first, then branch from it.
- Verify: `git ls-remote origin` lists `refs/heads/main`.
- Seen: 2026-11-12

## Build

### Vercel: `vite: command not found`
- Symptom: `sh: line 1: vite: command not found`, `Command "vite build" exited with 127`.
- Root cause: the deployed commit has no `package.json` (e.g. `main` before the stage 1 merge), so nothing was installed.
- Fix: none needed; deploy a commit that contains the project. Preset must be Vite.
- Verify: the Vercel deployment for the PR branch is green.
- Seen: 2026-11-12

## Render

### Light dashed lines along wall tops
- Symptom: thin light slivers on every seam between wall cells, flickering when the camera moves.
- Root cause: side faces of neighbouring instanced boxes tie in depth with the top faces at the seam.
- Fix: wall-top material uses `polygonOffset` (-2, -2) (`CAP` in `src/render/office.ts`).
- Verify: screenshot of a corridor shows clean dark wall tops.
- Seen: 2026-11-12

### Object.assign on an Object3D breaks the page
- Symptom: `TypeError: Cannot assign to read only property 'position' of object`; blank canvas, `window.__goose` undefined.
- Root cause: `position`, `rotation`, `scale` of a Three.js `Object3D` are read-only properties; they cannot be replaced.
- Fix: mutate them (`object.position.set(x, y, z)`), never assign or `Object.assign`.
- Verify: Playwright run prints no page errors.
- Seen: 2026-11-12

### Headless screenshot check of the game
- Symptom: need to verify visuals without a GPU.
- Root cause: cloud container has no GPU; WebGL needs the software renderer.
- Fix: `npm run build`, `npx vite preview --port 4173`, launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; read state via `window.__goose.world()`.
- Verify: screenshot shows the office; frame rate there says nothing about real hardware.
- Seen: 2026-11-12

## Sim

### Level generation takes a minute on rare seeds
- Symptom: `generateLevel` runs ~60 s for one seed in hundreds (seed 55 before the fix); tests time out.
- Root cause: A* heap stored cells and read priorities from a shared array; lowering a priority in place corrupted the heap order.
- Fix: heap of (priority, cell) pairs with a closed set, stale entries skipped (`route` in `src/sim/level.ts`).
- Verify: generating seeds 1–400 takes under 100 ms each.
- Seen: 2026-11-12

### Rooms unreachable although the map looks connected
- Symptom: reachability test below 0.97; ASCII map shows doors and corridors everywhere.
- Root cause: one-metre pinches — a corridor offset from its door by a cell, a corridor squeezed against a room corner, or two props narrowing a junction.
- Fix: widen door mouths (`stamp` 3), require 2×2 clearance in `route`, reserve walkway cells in `placeAgainstWall`, final `pruneBlockers` pass.
- Verify: `npx vitest run src/sim`; debug by printing `blocked()` on a 0.5 m grid around the break.
- Seen: 2026-11-12

### Bot stuck at a corner, re-planning forever
- Symptom: a bot stands still with a goal and a path; `left` tasks never finish in the bot test.
- Root cause: nav cells use a small margin, and a waypoint counted as reached 0.3 m early, so the bot cut a corner into a plant or desk and slid to a halt.
- Fix: waypoint reach 0.12 m; straight shortcuts checked with real collision (`fitsIn`, radius +0.08); start re-centred on a free cell (`src/sim/nav.ts`, `bots.ts`).
- Verify: bot completion sweep over many seeds; dump `blocked()` on a 0.25 m grid around the bot.
- Seen: 2026-11-12

### Bots stuck together in a corner forever
- Symptom: a bot-only match never ends; two bots stand in one spot with `goal: null` and a rotating `avoid`.
- Root cause: path search started from the single nearest nav cell, which sat in a grid pocket the chick was not really trapped in.
- Fix: multi-start A* from every free cell the chick can walk to in a straight line (`START_RING` in `src/sim/nav.ts`).
- Verify: bot-only match sweep (20 seeds) — every match reaches `phase: 'over'`.
- Seen: 2026-11-12

## Mini-games

### New hub prop breaks reachability
- Symptom: `keeps every room and almost all free floor reachable` fails for one seed (e.g. «seed 28: expected 0.67 > 0.97»).
- Root cause: a hub prop next to a corner plant left a sub-2 m slit where a door can open; the room behind it got cut off.
- Fix: place hub props ≥2 m from other hub furniture along walls (`briefTablet` moved to x 0.6 in `prefabs.ts`).
- Verify: `npx vitest run src/sim/level.test.ts`.
- Seen: 2026-11-12


### Mini-game won but never closes
- Symptom: counter shows the target (e.g. «15 / 15») but the «Готово!» banner never appears and the task stays undone.
- Root cause: the win check compared status before/after `tick`, but the winning move came from input between ticks.
- Fix: views report `ctx.win()` from `draw()` behind a `reported` flag (`src/minigames/modus/view.ts`).
- Verify: headless playthrough reaches `done: true` for every task.
- Seen: 2026-11-12

### Headless playthrough times out
- Symptom: Playwright script waits forever for a mini-game to finish in the cloud.
- Root cause: no GPU; SwiftShader renders ~4× slower than real time, and the fixed-step sim follows the frame rate (dt clamp 0.1 s).
- Fix: poll DOM state instead of fixed waits; wait for `#minigame` to be hidden; allow minutes, not seconds.
- Verify: measure `__goose.world().tick` over 3 s (≈0.24 sim s per real s here).
- Seen: 2026-11-12

### Playwright drag fails on short-lived targets
- Symptom: «Монтаж новостніків» stays at «Вкинуто: 0 / 6» in a headless run; mouse drags never land.
- Root cause: under SwiftShader each `page.mouse` step waits for a frame, so the picture expires (1.5 sim s) mid-drag.
- Fix: dispatch `pointerdown` on the tile and `pointermove`/`pointerup` on `window` inside `page.evaluate`; same handlers as a real drag.
- Verify: count climbs to 6/6 and the Giant Green Button enables.
- Seen: 2026-11-12

### Unrelated bot tests fail after touching `createBrain`
- Symptom: `goose.test.ts` «gives the Goose the win…» packs 1 chick instead of 6 after adding a Brain field.
- Root cause: an extra `rng` draw in `createBrain` shifts every bot's start-up rolls, so bots act differently on fixed seeds.
- Fix: initialise new Brain fields with a constant (e.g. `-1`) and roll them on first use inside `thinkBot`/`gooseMind`.
- Verify: `npm run test` — all files green with no test edits.
- Seen: 2026-11-12

### `console.log` from a passing Vitest file shows nothing
- Symptom: a throwaway measurement test prints no rows although it passes.
- Root cause: the default reporter hides console output of passing tests in this setup.
- Fix: write results with `node:fs` `writeFileSync` to a scratch file and read that.
- Verify: the file holds one row per seed.
- Seen: 2026-11-12

### HUD banner stays visible after its state is gone
- Symptom: the red sabotage banner hangs on screen after a meeting interrupted the sabotage.
- Root cause: `refresh()` reset the cached text to `''`; the next draw also produced `''`, saw no change and skipped hiding.
- Fix: reset caches to a sentinel no text can equal (`STALE` in `src/ui/hud.ts`).
- Verify: start a sabotage, call a meeting, the banner is gone during and after it.
- Seen: 2026-11-13

### Phone emulation in Playwright
- Symptom: touch UI does not appear, or screenshots of both orientations exceed the 2-minute command limit.
- Root cause: touch mode needs `hasTouch: true, isMobile: true` (media `hover: none, pointer: coarse`); SwiftShader is slow.
- Fix: one orientation per run; real multi-touch via CDP `Input.dispatchTouchEvent`; `__goose.advance(s)` to skip time.
- Verify: `html.touch` class is set and `#touch .act` buttons show in play.
- Seen: 2026-11-13

## CI

## Online
### «Гра з друзями» block is missing in the lobby
- Symptom: no create/join controls on the deployed site.
- Root cause: `VITE_SERVER_URL` was empty when the site was built; it is read at build time.
- Fix: set it in the site host's settings (`wss://<name>.onrender.com`) and redeploy the site.
- Verify: the lobby shows the block; locally use `?server=ws://localhost:8787` on `localhost` only.
- Seen: 2026-11-13

### Browser cannot connect to the game server
- Symptom: «Будимо офіс…» for over a minute, then «Зв'язок із сервером втрачено».
- Root cause: the free instance is still waking; or `ALLOWED_ORIGINS` on the server does not list the site address exactly (scheme, no trailing slash); or `ws://` used from an `https://` page.
- Fix: open `https://<server>/healthz` (must answer `ok N`); correct `ALLOWED_ORIGINS`; use `wss://`.
- Verify: two browser tabs, create a room in one, join by code in the other.
- Seen: 2026-11-13

### Two-browser test in the cloud sandbox
- Symptom: need to check online play without a deployed server.
- Fix: `npm run build && npm run build:server`, `PORT=8787 node server/dist/index.js`, `vite preview`, open two Playwright pages with `?server=ws://localhost:8787` (second with `&room=CODE`). `__goose.send/advance` do nothing online by design.
- Seen: 2026-11-13

### Playwright `click()` times out on meeting buttons in the sandbox
- Symptom: `page.click` on a `.say-chip` or vote card waits forever though the element is visible and on top.
- Root cause: SwiftShader frames take seconds; the meeting window is rebuilt on every new chat line, so the element is never "stable" long enough.
- Fix: press through the page (`page.evaluate(() => el.click())`); it runs the same handlers. Stage game situations with a throw-away server script built from `server/room.ts`, sending commands via `room.receive`, never `applyCommand` directly (events would bypass the players).
- Seen: 2026-11-13

### No Vercel preview on pull requests
- Symptom: PRs from `claude/*` branches show no Vercel check or preview link.
- Root cause: by design since 2026-11-13: `vercel.json` disables deployments for `claude/*` to stay under the free 100 deployments/day limit. Only `main` deploys.
- Fix: none needed; to preview a branch, remove the pattern in `vercel.json` or deploy it manually in Vercel.
- Seen: 2026-11-13

