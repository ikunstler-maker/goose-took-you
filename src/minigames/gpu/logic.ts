import {
  GPU_COOL_RATE,
  GPU_DRIFT_AMPLITUDE,
  GPU_DRIFT_CHANCE,
  GPU_DRIFT_PERIOD,
  GPU_HEAT_RATE,
  GPU_HOLD_MAX,
  GPU_HOLD_MIN,
  GPU_RATE_SPREAD,
  GPU_SPIKE,
  GPU_SPIKE_CHANCE,
  GPU_START_TEMP,
  GPU_ZONE_CENTRE_MAX,
  GPU_ZONE_CENTRE_MIN,
  GPU_ZONE_WIDTH_MAX,
  GPU_ZONE_WIDTH_MIN,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

/** «Охолоди GPU»: hold the fan to keep the temperature in the green zone long enough. Every card is different. */
export interface GpuState {
  rng: Rng;
  temp: number;
  /** Green zone: centre at rest, width, and how far it drifts (0 for a steady card). */
  centre: number;
  width: number;
  drift: number;
  /** Seconds in the zone that cool this card. */
  holdTime: number;
  /** This card heats and cools faster or slower than the book says. */
  heat: number;
  cool: number;
  time: number;
  /** Continuous seconds spent in the green zone. */
  held: number;
  done: boolean;
}

const roll = (rng: Rng, min: number, max: number): number => min + rng.next() * (max - min);

export function createGpu(seed: number): GpuState {
  const rng = createRng(seed);
  const centre = roll(rng, GPU_ZONE_CENTRE_MIN, GPU_ZONE_CENTRE_MAX);
  return {
    centre,
    width: roll(rng, GPU_ZONE_WIDTH_MIN, GPU_ZONE_WIDTH_MAX),
    drift: rng.next() < GPU_DRIFT_CHANCE ? GPU_DRIFT_AMPLITUDE : 0,
    holdTime: Math.round(roll(rng, GPU_HOLD_MIN, GPU_HOLD_MAX)),
    heat: GPU_HEAT_RATE * roll(rng, 1 - GPU_RATE_SPREAD, 1 + GPU_RATE_SPREAD),
    cool: GPU_COOL_RATE * roll(rng, 1 - GPU_RATE_SPREAD, 1 + GPU_RATE_SPREAD),
    rng,
    temp: GPU_START_TEMP,
    time: 0,
    held: 0,
    done: false,
  };
}

/** Bounds of the green zone right now. */
export function zone(state: GpuState): { low: number; high: number } {
  const centre = state.centre + Math.sin((state.time * Math.PI * 2) / GPU_DRIFT_PERIOD) * state.drift;
  return { low: centre - state.width / 2, high: centre + state.width / 2 };
}

export function inZone(state: GpuState): boolean {
  const { low, high } = zone(state);
  return state.temp >= low && state.temp <= high;
}

export function tickGpu(state: GpuState, dt: number, fanOn: boolean): void {
  if (state.done) return;
  state.time += dt;
  state.temp += (fanOn ? -state.cool : state.heat) * dt;
  if (state.rng.next() < GPU_SPIKE_CHANCE * dt) state.temp += GPU_SPIKE;
  state.temp = Math.min(1, Math.max(0, state.temp));
  state.held = inZone(state) ? state.held + dt : 0;
  if (state.held >= state.holdTime) state.done = true;
}
