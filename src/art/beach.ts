// Clickbait parody art shared by the news mini-game cards and the Lobby
// broadcast: round chibi beach-goers in swimwear with a pixel mosaic over the
// chest and hips. Cartoon blobs in the chicks' style, no anatomy; the mosaic
// is the joke. Pure 2D canvas, no assets.

type G = CanvasRenderingContext2D;

const SKIN = ['#f6cfa8', '#e8b48a', '#c98f62', '#9a6844', '#fbe0c4'];
const HAIR = ['#3a2a1e', '#d9a441', '#b5452c', '#1d1d24', '#f2e6c8', '#7a4fd0'];
const SUIT = ['#ff5d8f', '#3fc3ff', '#ffc93d', '#7be05a', '#b07cff', '#ff8a3d'];

/** Small deterministic hash stream for a variant number. */
function stream(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blocky "censored" patch: a grid of flat squares in skin and suit tones. */
function mosaic(g: G, x: number, y: number, w: number, h: number, cols: number, rows: number, tones: string[], rand: () => number): void {
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.fillStyle = tones[Math.floor(rand() * tones.length)]!;
      g.fillRect(x + c * cw, y + r * ch, cw + 0.5, ch + 0.5);
    }
  }
}

/**
 * One chibi beach-goer standing on (x, y) (feet), `h` tall. `variant` picks
 * skin, hair, swimsuit and build; `stride` (-1..1) swings arms and legs.
 */
export function drawBeachChibi(g: G, x: number, y: number, h: number, variant: number, stride = 0): void {
  const rand = stream(variant + 1);
  const skin = SKIN[Math.floor(rand() * SKIN.length)]!;
  const hair = HAIR[Math.floor(rand() * HAIR.length)]!;
  const suit = SUIT[Math.floor(rand() * SUIT.length)]!;
  const longHair = rand() < 0.5;
  const hat = rand() < 0.25;
  const u = h / 10;
  const bodyW = 3.4 * u + rand() * 0.8 * u;
  const headR = 2.3 * u;
  const hipY = y - 2.6 * u;
  const chestY = y - 5.4 * u;
  const headY = y - 7.6 * u;

  // Legs and arms: stubby rounded strokes.
  g.strokeStyle = skin;
  g.lineCap = 'round';
  g.lineWidth = 1.3 * u;
  g.beginPath();
  g.moveTo(x - 0.8 * u, hipY);
  g.lineTo(x - 0.8 * u + stride * 1.2 * u, y - 0.6 * u);
  g.moveTo(x + 0.8 * u, hipY);
  g.lineTo(x + 0.8 * u - stride * 1.2 * u, y - 0.6 * u);
  g.stroke();
  g.lineWidth = 1.05 * u;
  g.beginPath();
  g.moveTo(x - bodyW / 2, chestY);
  g.lineTo(x - bodyW / 2 - 0.9 * u, chestY + 1.6 * u - stride * 1.1 * u);
  g.moveTo(x + bodyW / 2, chestY);
  g.lineTo(x + bodyW / 2 + 0.9 * u, chestY + 1.6 * u + stride * 1.1 * u);
  g.stroke();

  // Torso: one soft bean.
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(x, y - 4.2 * u, bodyW / 2, 2.3 * u, 0, 0, Math.PI * 2);
  g.fill();

  // Swimsuit bands, then the mosaic over both.
  g.fillStyle = suit;
  g.fillRect(x - bodyW / 2 + 0.2 * u, chestY - 0.5 * u, bodyW - 0.4 * u, 1.1 * u);
  g.fillRect(x - bodyW / 2 + 0.3 * u, hipY - 0.9 * u, bodyW - 0.6 * u, 1.2 * u);
  const tones = [skin, suit, '#ffffff', skin, '#e9d6c0', suit];
  mosaic(g, x - bodyW / 2 - 0.1 * u, chestY - 0.8 * u, bodyW + 0.2 * u, 1.7 * u, 5, 2, tones, rand);
  mosaic(g, x - bodyW / 2 - 0.1 * u, hipY - 1.2 * u, bodyW + 0.2 * u, 1.8 * u, 5, 2, tones, rand);

  // Head, hair, face.
  if (longHair) {
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(x, headY + 0.9 * u, headR * 1.08, headR * 1.3, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = skin;
  g.beginPath();
  g.arc(x, headY, headR, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hair;
  g.beginPath();
  g.arc(x, headY - 0.3 * u, headR * 1.02, Math.PI * 1.05, Math.PI * 1.95);
  g.fill();
  if (hat) {
    g.fillStyle = '#f4e3b0';
    g.beginPath();
    g.ellipse(x, headY - 1.5 * u, headR * 1.6, 0.5 * u, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x, headY - 1.6 * u, headR * 0.8, Math.PI, 0);
    g.fill();
  }
  g.fillStyle = '#2a2018';
  g.beginPath();
  g.arc(x - 0.8 * u, headY + 0.2 * u, 0.28 * u, 0, Math.PI * 2);
  g.arc(x + 0.8 * u, headY + 0.2 * u, 0.28 * u, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2018';
  g.lineWidth = 0.22 * u;
  g.beginPath();
  g.arc(x, headY + 0.7 * u, 0.6 * u, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

/** A running chick in the game's own style: yellow blob, beak, stick legs. */
export function drawRunningChick(g: G, x: number, y: number, h: number, color: string, stride = 0): void {
  const r = h * 0.42;
  g.strokeStyle = '#e8862e';
  g.lineWidth = h * 0.07;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - r * 0.3, y - r * 0.5);
  g.lineTo(x - r * 0.3 + stride * r * 0.6, y);
  g.moveTo(x + r * 0.3, y - r * 0.5);
  g.lineTo(x + r * 0.3 - stride * r * 0.6, y);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y - h * 0.55, r, r * 1.05, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x + r * 0.35, y - h * 0.66, r * 0.26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2018';
  g.beginPath();
  g.arc(x + r * 0.42, y - h * 0.66, r * 0.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff9a3d';
  g.beginPath();
  g.moveTo(x + r * 0.85, y - h * 0.6);
  g.lineTo(x + r * 1.35, y - h * 0.52);
  g.lineTo(x + r * 0.85, y - h * 0.44);
  g.closePath();
  g.fill();
}

/** A thumbnail card for the news grid: beach backdrop and one chibi. */
export function drawBeachCard(g: G, size: number, art: number): void {
  const rand = stream(art ^ 0x51ed);
  const sky = ['#8fd3ff', '#ffd9a8', '#b9e6ff', '#ffc2d4'][Math.floor(rand() * 4)]!;
  g.fillStyle = sky;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffe680';
  g.beginPath();
  g.arc(size * (0.2 + rand() * 0.6), size * 0.2, size * 0.11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3fa9d9';
  g.fillRect(0, size * 0.55, size, size * 0.14);
  g.fillStyle = '#f2d9a0';
  g.fillRect(0, size * 0.69, size, size * 0.31);
  if (rand() < 0.6) {
    // Beach umbrella.
    const ux = size * (rand() < 0.5 ? 0.2 : 0.8);
    g.strokeStyle = '#8a6a3c';
    g.lineWidth = size * 0.03;
    g.beginPath();
    g.moveTo(ux, size * 0.9);
    g.lineTo(ux, size * 0.42);
    g.stroke();
    g.fillStyle = ['#ff5d8f', '#ff8a3d', '#7be05a'][Math.floor(rand() * 3)]!;
    g.beginPath();
    g.arc(ux, size * 0.44, size * 0.2, Math.PI, 0);
    g.fill();
  }
  drawBeachChibi(g, size * (0.42 + rand() * 0.16), size * 0.95, size * 0.72, art, (rand() - 0.5) * 0.8);
}
