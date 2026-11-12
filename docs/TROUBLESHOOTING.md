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

### PR cannot be opened in an empty repository
- Symptom: repository has no branches; `git ls-remote origin` prints nothing; no base branch for a PR.
- Root cause: GitHub needs an existing base branch that shares history with the head branch.
- Fix: with the owner's permission push one empty commit to `main` first, then branch from it.
- Verify: `git ls-remote origin` lists `refs/heads/main`.
- Seen: 2026-11-12

## Build

## Render

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

## CI
