---
paths:
  - "src/render/**"
  - "src/audio/**"
---
# Rendering and audio rules
- Read sim state and events; never mutate the sim.
- No external assets (`.glb`, `.obj`, images, audio files): procedural geometry, `CanvasTexture`, Web Audio synthesis.
- Every material goes through `mat()` or `withFog()` so it fades outside the player's sight.
- Static props are merged per chunk by `mergeStatics`; only parts tagged `userData.spin` / `userData.sway` or with their own texture stay separate.
- Walls are one `InstancedMesh`; cutaway height is animated per cell.
- Budget: 60 fps on a mid-range laptop; one sun light whose shadow map is redrawn only on request (`stage.refreshShadows`); no allocations in per-frame loops.
- Hub furniture is fixed per room type; room shape, filler furniture and colour variants change between matches.
- Cargo box and vacation box share one model; the only differences are the sticker and the close-range prompt.
- Original look only: no Among Us shapes, palette or UI; parody brand names only.
- Audio starts only after a user gesture; master volume and mute are always available.
- Before a PR with visual changes: Playwright screenshot at scale 1, cropped to the changed area.
