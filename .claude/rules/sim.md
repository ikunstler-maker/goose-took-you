---
paths:
  - "src/sim/**"
  - "src/config.ts"
---
# Simulation rules
- Pure TypeScript: no imports from `three`, DOM, audio or render code.
- Randomness only through the seeded RNG passed in; never `Math.random` or `Date.now`.
- State changes only through commands → systems → events. Bots and the player issue the same commands.
- Fixed timestep; no frame-rate-dependent logic.
- State stays serialisable (plain objects and typed arrays, no class instances), ready for a future network transport.
- Level generation: seed → room shapes in loose sectors → hubs → doors and routed corridors → nooks → filler furniture → `pruneBlockers`. Every room must be reachable with real collision (unit test).
- New furniture rules must keep passages two cells wide; never rely on the prune pass alone.
- Line of sight lives in `vision.ts`; rendering only displays it.
- Any rule change (roles, win conditions, timers, chances) needs a unit test and a constant in `src/config.ts`.
- Rule or balance change visible to the player → row in `docs/decisions.md` in the same PR.
