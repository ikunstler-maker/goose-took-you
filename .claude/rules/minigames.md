---
paths:
  - "src/minigames/**"
---
# Mini-game rules
- One folder per mini-game; common interface: open with context → result `done` or `cancelled`.
- Logic is separate from the DOM/canvas view and unit-tested; the view only draws and forwards input.
- Opening a mini-game never pauses the sim (the Goose can still act). `Esc` closes without progress.
- Mouse + keyboard only; fully playable at 1280×720.
- Timers, counts and thresholds live in `src/config.ts`.
- All copy through i18n keys, UA + RU.
- Visual tasks emit a sim event so the 3D room effect is visible to everyone nearby.
- "Censored" content: abstract pixel-mosaic blocks, or the chibi beach figures from `src/art/beach.ts` (cartoon blobs, no anatomy, mosaic over chest and hips); never realistic, recognisable or sexual imagery.
- New mini-game → add it to the SPEC room table and the GLOSSARY in the same PR.
