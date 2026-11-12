import { COPYCAT_SWITCHES, COPYCAT_WIRES } from '../../config';
import { createRng } from '../../sim/rng';

export interface CopycatState {
  /** Reference board: left node i is wired to right node `targetWires[i]`. */
  targetWires: number[];
  targetSwitches: boolean[];
  /** Player's board; null means the left node is not wired yet. */
  wires: (number | null)[];
  switches: boolean[];
}

export function createCopycat(seed: number): CopycatState {
  const rng = createRng(seed);
  const order = Array.from({ length: COPYCAT_WIRES }, (_, i) => i);
  let targetWires = rng.shuffle(order);
  // A straight-through pattern is too easy to eyeball; reshuffle once.
  if (targetWires.every((v, i) => v === i)) targetWires = targetWires.slice().reverse();
  const targetSwitches = Array.from({ length: COPYCAT_SWITCHES }, () => rng.next() < 0.5);
  // The board starts with every switch off, so at least one must be on.
  if (!targetSwitches.includes(true)) targetSwitches[rng.int(COPYCAT_SWITCHES)] = true;
  return {
    targetWires,
    targetSwitches,
    wires: Array.from({ length: COPYCAT_WIRES }, () => null),
    switches: Array.from({ length: COPYCAT_SWITCHES }, () => false),
  };
}

/** Wires left node to right node; a right node takes one wire, so its old wire is pulled out. */
export function connect(state: CopycatState, left: number, right: number): void {
  if (left < 0 || left >= COPYCAT_WIRES || right < 0 || right >= COPYCAT_WIRES) return;
  state.wires.forEach((r, l) => {
    if (r === right) state.wires[l] = null;
  });
  state.wires[left] = right;
}

export function disconnect(state: CopycatState, left: number): void {
  if (left >= 0 && left < COPYCAT_WIRES) state.wires[left] = null;
}

export function toggleSwitch(state: CopycatState, index: number): void {
  if (index >= 0 && index < COPYCAT_SWITCHES) state.switches[index] = !state.switches[index];
}

/** Share of matching wires and switches, 0..1. */
export function matchRatio(state: CopycatState): number {
  let ok = 0;
  state.wires.forEach((r, l) => {
    if (r === state.targetWires[l]) ok++;
  });
  state.switches.forEach((on, i) => {
    if (on === state.targetSwitches[i]) ok++;
  });
  return ok / (COPYCAT_WIRES + COPYCAT_SWITCHES);
}

export function isMatched(state: CopycatState): boolean {
  return matchRatio(state) === 1;
}
