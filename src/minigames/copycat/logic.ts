import {
  COPYCAT_MONO_CHANCE,
  COPYCAT_SWITCHES_MAX,
  COPYCAT_SWITCHES_MIN,
  COPYCAT_UPDATE_CHANCE,
  COPYCAT_WIRES_MAX,
  COPYCAT_WIRES_MIN,
} from '../../config';
import { createRng } from '../../sim/rng';

export interface CopycatState {
  /** Reference board: left node i is wired to right node `targetWires[i]`. */
  targetWires: number[];
  targetSwitches: boolean[];
  /** Player's board; null means the left node is not wired yet. */
  wires: (number | null)[];
  switches: boolean[];
  /** The reference is drawn in one colour: wires must be traced by eye. */
  mono: boolean;
  /** The competitor will change the reference once, when the copy is half done. */
  updatePending: boolean;
  /** Set once that change has happened, for the «creative updated» notice. */
  updated: boolean;
  /** Which switch the update flips. */
  updateSwitch: number;
}

export function createCopycat(seed: number): CopycatState {
  const rng = createRng(seed);
  const wireCount = COPYCAT_WIRES_MIN + rng.int(COPYCAT_WIRES_MAX - COPYCAT_WIRES_MIN + 1);
  const switchCount = COPYCAT_SWITCHES_MIN + rng.int(COPYCAT_SWITCHES_MAX - COPYCAT_SWITCHES_MIN + 1);
  const order = Array.from({ length: wireCount }, (_, i) => i);
  let targetWires = rng.shuffle(order);
  // A straight-through pattern is too easy to eyeball; reshuffle once.
  if (targetWires.every((v, i) => v === i)) targetWires = targetWires.slice().reverse();
  const targetSwitches = Array.from({ length: switchCount }, () => rng.next() < 0.5);
  // The board starts with every switch off, so at least one must be on.
  if (!targetSwitches.includes(true)) targetSwitches[rng.int(switchCount)] = true;
  return {
    targetWires,
    targetSwitches,
    wires: Array.from({ length: wireCount }, () => null),
    switches: Array.from({ length: switchCount }, () => false),
    mono: rng.next() < COPYCAT_MONO_CHANCE,
    updatePending: rng.next() < COPYCAT_UPDATE_CHANCE,
    updated: false,
    updateSwitch: rng.int(switchCount),
  };
}

/** Half-way through, the competitor may ship a new version: one reference switch flips. */
function maybeUpdate(state: CopycatState): void {
  if (!state.updatePending || matchRatio(state) < 0.5) return;
  state.updatePending = false;
  state.updated = true;
  const i = state.updateSwitch;
  state.targetSwitches[i] = !state.targetSwitches[i];
}

/** Wires left node to right node; a right node takes one wire, so its old wire is pulled out. */
export function connect(state: CopycatState, left: number, right: number): void {
  const n = state.wires.length;
  if (left < 0 || left >= n || right < 0 || right >= n) return;
  state.wires.forEach((r, l) => {
    if (r === right) state.wires[l] = null;
  });
  state.wires[left] = right;
  maybeUpdate(state);
}

export function disconnect(state: CopycatState, left: number): void {
  if (left >= 0 && left < state.wires.length) state.wires[left] = null;
}

export function toggleSwitch(state: CopycatState, index: number): void {
  if (index < 0 || index >= state.switches.length) return;
  state.switches[index] = !state.switches[index];
  maybeUpdate(state);
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
  return ok / (state.wires.length + state.switches.length);
}

export function isMatched(state: CopycatState): boolean {
  return matchRatio(state) === 1;
}
