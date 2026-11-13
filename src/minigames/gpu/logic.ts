import {
  GPU_COOL_RATE,
  GPU_HEAT_RATE,
  GPU_HOLD_TIME,
  GPU_SPIKE,
  GPU_SPIKE_CHANCE,
  GPU_START_TEMP,
  GPU_ZONE_HIGH,
  GPU_ZONE_LOW,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

/** «Охолоди GPU»: hold the fan to keep the temperature in the green zone long enough. */
export interface GpuState {
  rng: Rng;
  temp: number;
  /** Continuous seconds spent in the green zone. */
  held: number;
  done: boolean;
}

export function createGpu(seed: number): GpuState {
  return { rng: createRng(seed), temp: GPU_START_TEMP, held: 0, done: false };
}

export const inZone = (temp: number): boolean => temp >= GPU_ZONE_LOW && temp <= GPU_ZONE_HIGH;

export function tickGpu(state: GpuState, dt: number, fanOn: boolean): void {
  if (state.done) return;
  state.temp += (fanOn ? -GPU_COOL_RATE : GPU_HEAT_RATE) * dt;
  if (state.rng.next() < GPU_SPIKE_CHANCE * dt) state.temp += GPU_SPIKE;
  state.temp = Math.min(1, Math.max(0, state.temp));
  state.held = inZone(state.temp) ? state.held + dt : 0;
  if (state.held >= GPU_HOLD_TIME) state.done = true;
}
