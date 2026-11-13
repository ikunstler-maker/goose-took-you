// Every sound is synthesised with Web Audio: oscillators and filtered noise, no audio files.
import { SOUND_DEFAULT_VOLUME } from '../config';

export type SoundName =
  | 'step'
  | 'click'
  | 'bonk'
  /** A new Modus edit pops up / one is closed. */
  | 'sticker'
  | 'stickerClose'
  /** The carried box knocks; the box slips: «Куд-кудах-ай!» */
  | 'knock'
  | 'slip'
  | 'pickup'
  /** «га-га?» */
  | 'honk'
  /** A mini-game or delivery is done: coins and a fanfare. */
  | 'jackpot'
  | 'open'
  | 'news'
  | 'pack'
  | 'report'
  | 'carpet'
  | 'meeting'
  | 'chat'
  | 'vote'
  | 'alarm'
  | 'fix'
  | 'fixed'
  | 'win'
  | 'lose'
  /** Giant Green Button: the confetti pop, then a cheering crowd. */
  | 'splash'
  | 'ovation'
  /** The packed Streamer's «MEGA ALARM 777!»: a slot-machine siren. */
  | 'siren'
  /** A SysAdmin pops out of a rug: «Апчхи!» */
  | 'sneeze'
  /** The Goose roulette: a glitch crackle, a dial-up modem squeal, rustling leaves. */
  | 'glitch'
  | 'modem'
  | 'rustle';

export interface Sound {
  /** Call from a user gesture: browsers keep audio silent until then. */
  unlock(): void;
  /** `gain` scales this one sound, e.g. by distance. */
  play(name: SoundName, gain?: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
}

type Wave = OscillatorType;

export function createSound(volume = SOUND_DEFAULT_VOLUME, muted = false): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  const level = (): number => (muted ? 0 : volume * volume);

  const ensure = (): boolean => {
    if (ctx) return ctx.state === 'running';
    const Ctor = window.AudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    // One second of white noise, reused by every hiss, thud and rustle.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    return ctx.state === 'running';
  };

  /** One enveloped oscillator note; `to` glides the pitch. */
  const tone = (wave: Wave, from: number, to: number, at: number, length: number, gain: number): void => {
    const c = ctx!;
    const start = c.currentTime + at;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + length);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.012, length / 3));
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(amp).connect(master!);
    osc.start(start);
    osc.stop(start + length + 0.02);
  };

  /** A burst of filtered noise. */
  const hiss = (type: BiquadFilterType, freq: number, at: number, length: number, gain: number): void => {
    const c = ctx!;
    const start = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const amp = c.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    src.connect(filter).connect(amp).connect(master!);
    src.start(start, (start * 0.37) % 0.5, length + 0.02);
  };

  const notes = (wave: Wave, freqs: number[], step: number, length: number, gain: number, at = 0): void => {
    freqs.forEach((f, i) => tone(wave, f, f, at + i * step, length, gain));
  };

  const RECIPES: Record<SoundName, (g: number) => void> = {
    step: (g) => {
      hiss('lowpass', 500, 0, 0.06, 0.16 * g);
      tone('sine', 150, 90, 0, 0.05, 0.08 * g);
    },
    click: (g) => tone('square', 1100, 700, 0, 0.035, 0.07 * g),
    bonk: (g) => {
      tone('sine', 220, 70, 0, 0.16, 0.4 * g);
      hiss('lowpass', 300, 0, 0.08, 0.25 * g);
    },
    sticker: (g) => tone('triangle', 500, 1150, 0, 0.09, 0.16 * g),
    stickerClose: (g) => {
      hiss('highpass', 2500, 0, 0.07, 0.12 * g);
      tone('sine', 900, 380, 0, 0.08, 0.12 * g);
    },
    knock: (g) => {
      tone('sine', 190, 120, 0, 0.06, 0.2 * g);
      hiss('bandpass', 900, 0, 0.04, 0.1 * g);
    },
    slip: (g) => {
      // «Куд-кудах-ай!»: three squawks going up, then the box hits the floor.
      tone('sawtooth', 520, 430, 0, 0.09, 0.14 * g);
      tone('sawtooth', 560, 470, 0.1, 0.09, 0.14 * g);
      tone('sawtooth', 620, 980, 0.2, 0.2, 0.16 * g);
      tone('sine', 160, 55, 0.38, 0.2, 0.45 * g);
      hiss('lowpass', 400, 0.38, 0.14, 0.3 * g);
    },
    pickup: (g) => tone('triangle', 300, 520, 0, 0.1, 0.14 * g),
    honk: (g) => {
      // Two nasal «га-га»: a saw with a falling pitch, twice.
      tone('sawtooth', 330, 250, 0, 0.16, 0.16 * g);
      tone('square', 165, 125, 0, 0.16, 0.06 * g);
      tone('sawtooth', 350, 240, 0.2, 0.22, 0.17 * g);
      tone('square', 175, 120, 0.2, 0.22, 0.06 * g);
    },
    jackpot: (g) => {
      notes('triangle', [523, 659, 784, 1047, 1319], 0.085, 0.2, 0.16 * g);
      // Coins: bright pings scattered over the fanfare.
      [0.15, 0.27, 0.36, 0.48, 0.57, 0.69].forEach((at, i) => tone('sine', 2400 + (i % 3) * 420, 2300, at, 0.09, 0.07 * g));
    },
    open: (g) => notes('sine', [440, 660], 0.06, 0.09, 0.1 * g),
    news: (g) => notes('square', [392, 392, 523, 659], 0.11, 0.14, 0.07 * g),
    pack: (g) => {
      hiss('lowpass', 900, 0, 0.25, 0.3 * g);
      tone('sine', 200, 60, 0.05, 0.25, 0.4 * g);
      hiss('highpass', 3000, 0.28, 0.12, 0.12 * g);
    },
    report: (g) => notes('square', [880, 660, 880, 660], 0.12, 0.11, 0.09 * g),
    carpet: (g) => hiss('bandpass', 1400, 0, 0.3, 0.2 * g),
    meeting: (g) => {
      tone('sine', 196, 190, 0, 1.1, 0.35 * g);
      tone('sine', 392, 388, 0, 0.8, 0.12 * g);
      tone('sine', 587, 580, 0, 0.5, 0.06 * g);
    },
    chat: (g) => tone('sine', 700, 900, 0, 0.05, 0.06 * g),
    vote: (g) => notes('triangle', [600, 800], 0.07, 0.08, 0.12 * g),
    alarm: (g) => {
      tone('sawtooth', 620, 620, 0, 0.26, 0.09 * g);
      tone('sawtooth', 440, 440, 0.3, 0.26, 0.09 * g);
    },
    fix: (g) => notes('triangle', [440, 587], 0.08, 0.12, 0.14 * g),
    fixed: (g) => notes('triangle', [392, 523, 659, 784], 0.1, 0.22, 0.14 * g),
    win: (g) => notes('triangle', [523, 523, 659, 784, 659, 784, 1047], 0.13, 0.26, 0.16 * g),
    splash: (g) => {
      hiss('highpass', 1800, 0, 0.35, 0.4 * g);
      hiss('lowpass', 600, 0, 0.18, 0.35 * g);
      tone('sine', 300, 900, 0, 0.12, 0.18 * g);
    },
    ovation: (g) => {
      // Applause: a swell of many short claps, plus a few rising whoops.
      for (let i = 0; i < 70; i++) {
        const at = 0.1 + (i * 0.037) + ((i * 7919) % 13) * 0.004;
        const swell = Math.sin((Math.PI * i) / 70);
        hiss('bandpass', 1500 + ((i * 331) % 1400), at, 0.05, (0.06 + 0.12 * swell) * g);
      }
      [0.5, 1.1, 1.7].forEach((at, i) => tone('triangle', 500 + i * 90, 950 + i * 120, at, 0.32, 0.05 * g));
    },
    lose: (g) => notes('sawtooth', [392, 349, 311, 262], 0.22, 0.34, 0.1 * g),
    siren: (g) => {
      // A wailing up-and-down sweep, then a slot machine's bells.
      for (let i = 0; i < 4; i++) {
        tone('sawtooth', 500, 1100, i * 0.5, 0.25, 0.1 * g);
        tone('sawtooth', 1100, 500, i * 0.5 + 0.25, 0.25, 0.1 * g);
      }
      notes('triangle', [1319, 1568, 2093], 0.12, 0.2, 0.08 * g, 2.05);
    },
    glitch: (g) => {
      // Digital crackle: short square blips jumping in pitch over a hiss.
      [880, 1760, 660, 1320, 990, 2200].forEach((f, i) => tone('square', f, f * 0.8, i * 0.06, 0.05, 0.06 * g));
      hiss('highpass', 4000, 0, 0.4, 0.12 * g);
    },
    modem: (g) => {
      // Dial-up handshake: a two-tone chirp, then a noisy screech.
      tone('sine', 1650, 1650, 0, 0.18, 0.08 * g);
      tone('sine', 1850, 1850, 0.2, 0.18, 0.08 * g);
      tone('sawtooth', 2100, 900, 0.42, 0.35, 0.06 * g);
      hiss('bandpass', 2400, 0.42, 0.45, 0.18 * g);
    },
    rustle: (g) => {
      hiss('bandpass', 3200, 0, 0.35, 0.16 * g);
      hiss('bandpass', 2400, 0.12, 0.3, 0.12 * g);
    },
    sneeze: (g) => {
      // «Ап…» a sharp breath in, «…чхи!» a noisy burst.
      tone('sine', 300, 700, 0, 0.25, 0.08 * g);
      hiss('highpass', 2200, 0.3, 0.22, 0.35 * g);
      tone('square', 420, 180, 0.3, 0.12, 0.07 * g);
    },
  };

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    play(name, gain = 1) {
      if (gain <= 0 || level() === 0 || !ensure()) return;
      RECIPES[name](gain);
    },
    setVolume(value) {
      volume = Math.min(1, Math.max(0, value));
      if (master) master.gain.value = level();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = level();
    },
  };
}
