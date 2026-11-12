---
paths:
  - "src/render/**"
  - "src/audio/**"
---
# Rendering and audio rules
- Read sim state and events; never mutate the sim.
- No external assets (`.glb`, `.obj`, images, audio files): procedural geometry, `CanvasTexture`, Web Audio synthesis.
- Reuse geometries and materials; instance repeated props (plants, desks, boxes); dispose everything on match restart.
- Budget: 60 fps on a mid-range laptop; one shadow-casting sun light; no allocations in per-frame loops.
- Room prefab interiors are fixed: only the room's slot and rotation change between matches.
- Cargo box and vacation box share one model; the only differences are the sticker and the close-range prompt.
- Original look only: no Among Us shapes, palette or UI; parody brand names only.
- Audio starts only after a user gesture; master volume and mute are always available.
- Before a PR with visual changes: Playwright screenshot at scale 1, cropped to the changed area.
