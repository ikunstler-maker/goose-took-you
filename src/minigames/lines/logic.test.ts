import { describe, expect, it } from 'vitest';
import { LINES_COUNT } from '../../config';
import {
  addLine,
  createBrief,
  createLines,
  declared,
  isComplete,
  isPerpendicular,
  lineAt,
  progress,
  snapEnd,
  tagLine,
  toggleForced,
  toggleKitten,
  undo,
  type Ink,
  type LinesState,
} from './logic';

/** Plays a brief the way a player would: pick inks, then patch everything else with stamps. */
function solve(state: LinesState): void {
  const inks: (Ink | null)[] = Array.from({ length: LINES_COUNT }, () => null);
  const tags: (string | null)[] = Array.from({ length: LINES_COUNT }, () => null);
  const reqs = state.brief.requirements;
  for (const req of reqs) {
    if (req.kind !== 'match' || req.ink === undefined) continue;
    let left = req.need;
    for (let i = 0; i < LINES_COUNT && left > 0; i++) {
      if (inks[i] !== null) continue;
      inks[i] = req.ink;
      if (req.declared) tags[i] = req.declared;
      left--;
    }
  }
  for (let i = 0; i < LINES_COUNT; i++) {
    addLine(state, 20 + i * 60, 20, 20 + i * 60, 200, inks[i] ?? 'red');
    if (tags[i]) tagLine(state.lines[i]!, tags[i] as 'red');
  }
  for (const req of reqs) {
    if (req.kind !== 'match' || req.declared === undefined || req.ink !== undefined) continue;
    let left = req.need - progress(state, req);
    for (const line of state.lines) {
      if (left <= 0) break;
      if (line.tag !== null || declared(line) === req.declared) continue;
      tagLine(line, req.declared);
      left--;
    }
  }
  for (const line of state.lines) toggleForced(line);
  const kittens = reqs.find((r) => r.kind === 'kitten');
  if (kittens) for (let i = 0; i < kittens.need; i++) toggleKitten(state.lines[i]!);
}

describe('lines mini-game', () => {
  it('builds varied briefs that are always 7 lines plus contradictions', () => {
    const variants = new Set<string>();
    let kittens = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const brief = createBrief(seed);
      variants.add(brief.variant);
      expect(brief.requirements[0]).toEqual({ kind: 'lines', need: LINES_COUNT });
      expect(brief.requirements.some((r) => r.kind === 'perp')).toBe(true);
      if (brief.requirements.some((r) => r.kind === 'kitten')) kittens++;
    }
    expect(variants.size).toBe(4);
    expect(kittens / 200).toBeGreaterThan(0.5);
    expect(kittens / 200).toBeLessThan(0.8);
    expect(createBrief(7)).toEqual(createBrief(7));
  });

  it('every brief can be met with stamps', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const state = createLines(seed);
      expect(isComplete(state)).toBe(false);
      solve(state);
      expect(isComplete(state), `seed ${seed} ${state.brief.variant}`).toBe(true);
    }
  });

  it('snaps to 90° and counts honest perpendiculars until a third line spoils them', () => {
    const state = createLines(1);
    addLine(state, 0, 100, 200, 100, 'red');
    const snap = snapEnd(state, 100, 0, 108, 200);
    expect(snap.snapped).toBe(true);
    expect(snap.x2).toBeCloseTo(100);
    addLine(state, 100, 0, snap.x2, snap.y2, 'red');
    expect(state.lines.every((l) => isPerpendicular(state, l))).toBe(true);

    expect(snapEnd(state, 0, 0, 200, 200).snapped).toBe(false);
    addLine(state, 0, 0, 200, 200, 'red');
    expect(state.lines.filter((l) => isPerpendicular(state, l))).toHaveLength(0);
    toggleForced(state.lines[2]!);
    expect(state.lines.filter((l) => isPerpendicular(state, l))).toHaveLength(3);
  });

  it('stamps lines under the cursor, caps the count and undoes', () => {
    const state = createLines(1);
    expect(addLine(state, 0, 0, 10, 0, 'red')).toBe(false);
    for (let i = 0; i < LINES_COUNT + 2; i++) addLine(state, 0, i * 40, 300, i * 40, 'green');
    expect(state.lines).toHaveLength(LINES_COUNT);
    const hit = lineAt(state, 150, 83)!;
    expect(hit.id).toBe(3);
    tagLine(hit, 'red');
    expect(declared(hit)).toBe('red');
    tagLine(hit, 'red');
    expect(declared(hit)).toBe('green');
    expect(lineAt(state, 150, 20)).toBeNull();
    undo(state);
    expect(state.lines).toHaveLength(LINES_COUNT - 1);
  });
});
