import { describe, expect, it } from 'vitest';
import { CAMERA_ROOMS, TICK } from '../config';
import { cameraSpots, cameraView } from './cameras';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type WorldState } from './world';

function started(seed: number): WorldState {
  const state = createWorld(seed);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

/** Puts the player in front of the security desk. */
function atDesk(state: WorldState): void {
  const desk = state.level.props.find((p) => p.hub && p.kind === 'cameraDesk')!;
  me(state).x = desk.x;
  me(state).z = desk.z + desk.d / 2 + 0.5;
  step(state, TICK);
}

describe('security cameras', () => {
  it('watch one room of each listed type', () => {
    const state = started(42);
    const spots = cameraSpots(state.level);
    expect(spots.map((s) => state.level.rooms[s.room]!.type)).toEqual([...CAMERA_ROOMS]);
  });

  it('show who stands in the room, but not a packed chick or a hidden Goose', () => {
    const state = started(42);
    const lobby = cameraSpots(state.level)[0]!;
    const view = cameraView(state.level, lobby, state.participants, state.boxes);
    expect(view.participants).toContain(LOCAL_PLAYER);
    const ghost = state.participants.map((p) => ({ ...p, alive: p.id !== 1, under: p.id === 2 ? 0 : null }));
    const hidden = cameraView(state.level, lobby, ghost, state.boxes).participants;
    expect(hidden).not.toContain(1);
    expect(hidden).not.toContain(2);
  });

  it('are opened at the desk, freeze the chick and close on command', () => {
    const state = started(42);
    atDesk(state);
    expect(me(state).prompt).toEqual({ kind: 'cameras' });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toEqual([{ type: 'camerasOpened', who: LOCAL_PLAYER }]);
    const { x, z } = me(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 30; i++) step(state, TICK);
    expect(me(state).x).toBe(x);
    expect(me(state).z).toBe(z);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'stopWatching' })).toEqual([{ type: 'camerasClosed', who: LOCAL_PLAYER }]);
    expect(me(state).watching).toBe(false);
  });
});
