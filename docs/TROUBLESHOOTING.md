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

## CI
