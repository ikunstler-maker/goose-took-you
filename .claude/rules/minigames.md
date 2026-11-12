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
- "Censored" content is abstract pixel-mosaic blocks only; never recognisable or sexual imagery.
- New mini-game → add it to the SPEC room table and the GLOSSARY in the same PR.
