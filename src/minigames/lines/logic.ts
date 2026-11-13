import {
  LINES_COUNT,
  LINES_HIT_RADIUS,
  LINES_KITTEN_CHANCE,
  LINES_MIN_LENGTH,
  LINES_PERP_TOLERANCE_DEG,
  LINES_SNAP_DEG,
} from '../../config';
import { createRng } from '../../sim/rng';

export type Ink = 'red' | 'green' | 'blue' | 'clear';
/** Colour a line is declared to be by the tag stamp. */
export type TagColor = 'red' | 'green' | 'blue';

export interface Line {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ink: Ink;
  tag: TagColor | null;
  /** «90° (Замовник вірить)»: counts as perpendicular to everything. */
  forced: boolean;
  kitten: boolean;
}

/** One checklist row. `match` rows count lines passing the filter. */
export type Requirement =
  | { kind: 'lines'; need: number }
  | { kind: 'match'; need: number; ink?: Ink; declared?: TagColor }
  | { kind: 'perp'; need: number; all: boolean }
  | { kind: 'kitten'; need: number };

/** Which client sentence opens the brief; numbers fill its placeholders. */
export type BriefVariant = 'a' | 'b' | 'c' | 'd';

export interface Brief {
  variant: BriefVariant;
  params: Record<string, number>;
  requirements: Requirement[];
}

export interface LinesState {
  brief: Brief;
  lines: Line[];
  nextId: number;
}

/** Builds a random contradictory brief: colour paradox + geometry rule + maybe kittens. */
export function createBrief(seed: number): Brief {
  const rng = createRng(seed);
  const variant = rng.pick<BriefVariant>(['a', 'b', 'c', 'd']);
  const params: Record<string, number> = {};
  const requirements: Requirement[] = [{ kind: 'lines', need: LINES_COUNT }];
  switch (variant) {
    case 'a':
      params.green = 2 + rng.int(2);
      params.clear = 1 + rng.int(2);
      requirements.push(
        { kind: 'match', need: LINES_COUNT, declared: 'red' },
        { kind: 'match', need: params.green, ink: 'green' },
        { kind: 'match', need: params.clear, ink: 'clear' },
      );
      break;
    case 'b':
      params.blue = 2 + rng.int(2);
      params.green = 1 + rng.int(3);
      requirements.push(
        { kind: 'match', need: LINES_COUNT, declared: 'red' },
        { kind: 'match', need: params.blue, ink: 'blue' },
        { kind: 'match', need: params.green, ink: 'green' },
      );
      break;
    case 'c':
      params.clear = 3 + rng.int(3);
      params.blue = LINES_COUNT - params.clear;
      requirements.push(
        { kind: 'match', need: params.clear, ink: 'clear', declared: 'red' },
        { kind: 'match', need: params.blue, ink: 'blue', declared: 'blue' },
      );
      break;
    case 'd':
      params.red = 1 + rng.int(3);
      params.green = 1 + rng.int(3);
      requirements.push(
        { kind: 'match', need: LINES_COUNT, ink: 'blue' },
        { kind: 'match', need: params.red, declared: 'red' },
        { kind: 'match', need: params.green, declared: 'green' },
      );
      break;
  }
  const all = rng.next() < 0.5;
  params.perp = all ? LINES_COUNT : 5 + rng.int(2);
  requirements.push({ kind: 'perp', need: params.perp, all });
  if (rng.next() < LINES_KITTEN_CHANCE) {
    params.kitten = 1 + rng.int(2);
    requirements.push({ kind: 'kitten', need: params.kitten });
  }
  return { variant, params, requirements };
}

export function createLines(seed: number): LinesState {
  return { brief: createBrief(seed), lines: [], nextId: 1 };
}

/** Colour the line counts as: its tag, else its ink; clear ink has no colour of its own. */
export function declared(line: Line): TagColor | null {
  return line.tag ?? (line.ink === 'clear' ? null : line.ink);
}

const direction = (x1: number, y1: number, x2: number, y2: number): number => Math.atan2(y2 - y1, x2 - x1);

/** Angle between two undirected lines, 0..90 degrees. */
export function angleBetween(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
}

const lineDir = (l: Line): number => direction(l.x1, l.y1, l.x2, l.y2);

/** A line counts as perpendicular when stamped, or when it is at 90° to every unstamped line. */
export function isPerpendicular(state: LinesState, line: Line): boolean {
  if (line.forced) return true;
  return state.lines.every(
    (other) => other === line || other.forced || Math.abs(angleBetween(lineDir(line), lineDir(other)) - 90) <= LINES_PERP_TOLERANCE_DEG,
  );
}

export function progress(state: LinesState, req: Requirement): number {
  switch (req.kind) {
    case 'lines':
      return state.lines.length;
    case 'match':
      return state.lines.filter(
        (l) => (req.ink === undefined || l.ink === req.ink) && (req.declared === undefined || declared(l) === req.declared),
      ).length;
    case 'perp':
      return state.lines.filter((l) => isPerpendicular(state, l)).length;
    case 'kitten':
      return state.lines.filter((l) => l.kitten).length;
  }
}

export function isMet(state: LinesState, req: Requirement): boolean {
  const have = progress(state, req);
  return req.kind === 'lines' ? have === req.need : have >= req.need;
}

export function isComplete(state: LinesState): boolean {
  return state.brief.requirements.every((req) => isMet(state, req));
}

export interface Snap {
  x2: number;
  y2: number;
  snapped: boolean;
  /** Angle to the reference line, degrees, or null when the canvas is empty. */
  angle: number | null;
}

/** Magnetic pen: pulls the free end to exactly 90° off the closest-to-perpendicular drawn line. */
export function snapEnd(state: LinesState, x1: number, y1: number, x2: number, y2: number): Snap {
  if (state.lines.length === 0) return { x2, y2, snapped: false, angle: null };
  const dir = direction(x1, y1, x2, y2);
  let best: Line | null = null;
  let bestOff = Infinity;
  for (const line of state.lines) {
    const off = Math.abs(angleBetween(dir, lineDir(line)) - 90);
    if (off < bestOff) {
      bestOff = off;
      best = line;
    }
  }
  const angle = 90 - bestOff;
  if (bestOff > LINES_SNAP_DEG) return { x2, y2, snapped: false, angle };
  // Of the two perpendicular directions, keep the one closer to where the pointer is.
  const base = lineDir(best!);
  const candidates = [base + Math.PI / 2, base - Math.PI / 2];
  const target = candidates.reduce((a, b) => (Math.cos(a - dir) >= Math.cos(b - dir) ? a : b));
  const length = Math.hypot(x2 - x1, y2 - y1);
  return { x2: x1 + Math.cos(target) * length, y2: y1 + Math.sin(target) * length, snapped: true, angle: 90 };
}

/** Adds a pen stroke (already snapped). Returns false when too short or the canvas is full. */
export function addLine(state: LinesState, x1: number, y1: number, x2: number, y2: number, ink: Ink): boolean {
  if (state.lines.length >= LINES_COUNT || Math.hypot(x2 - x1, y2 - y1) < LINES_MIN_LENGTH) return false;
  state.lines.push({ id: state.nextId++, x1, y1, x2, y2, ink, tag: null, forced: false, kitten: false });
  return true;
}

/** The drawn line closest to a point within the hit radius, or null. */
export function lineAt(state: LinesState, x: number, y: number): Line | null {
  let best: Line | null = null;
  let bestDistance = LINES_HIT_RADIUS;
  for (const l of state.lines) {
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const t = Math.max(0, Math.min(1, ((x - l.x1) * dx + (y - l.y1) * dy) / (dx * dx + dy * dy)));
    const distance = Math.hypot(x - (l.x1 + t * dx), y - (l.y1 + t * dy));
    if (distance <= bestDistance) {
      best = l;
      bestDistance = distance;
    }
  }
  return best;
}

/** Tag stamp; stamping the same colour again peels the tag off. */
export function tagLine(line: Line, color: TagColor): void {
  line.tag = line.tag === color ? null : color;
}

export function toggleForced(line: Line): void {
  line.forced = !line.forced;
}

export function toggleKitten(line: Line): void {
  line.kitten = !line.kitten;
}

export function undo(state: LinesState): void {
  state.lines.pop();
}

export function clear(state: LinesState): void {
  state.lines = [];
}
