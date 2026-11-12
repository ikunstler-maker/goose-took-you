import type { TaskKind } from '../sim/tasks';

/** What a mini-game view gets from the host. */
export interface MinigameContext {
  seed: number;
  /** Empty element the view draws into. */
  body: HTMLElement;
  /** Called once when the round is won. */
  win(): void;
}

/** A mini-game screen: logic lives in `logic.ts`, the view only draws and forwards input. */
export interface MinigameView {
  /** Fixed-step logic update, seconds. */
  tick(dt: number): void;
  /** Redraw after a tick or a language switch. */
  draw(): void;
  destroy(): void;
}

export type MinigameFactory = (ctx: MinigameContext) => MinigameView;
export type { TaskKind };
