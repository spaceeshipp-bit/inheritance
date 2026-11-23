// The sounds of gestures and dances, synthesised like every other effect: a
// raspberry, a censor's bleep, a cash register, a tin-whistle jig, a music-box
// waltz, the (public domain) funeral march, a creaking hip, ragtime piano.
// Dance tunes are a bar or two long; the game re-plays them for as long as the
// dance goes on (TUNE_SECS).
import { EMOTES, type EmoteSound } from '../../../shared/emotes.js';
import { env, filter, noiseSrc, tone, type SynthCtx } from './synth.js';

const SOUNDS = new Set<string>(Object.values(EMOTES).map((d) => d.sound));
export function isEmoteSound(k: string): k is EmoteSound { return SOUNDS.has(k); }

/** How often a dance re-plays its tune (s). */
export const TUNE_SECS: Partial<Record<EmoteSound, number>> = {
  jig: 2.0, waltz: 2.16, shimmy: 2.0, stomp: 2.0, dirge: 4.2, creak: 2.0, ragtime: 2.0, twist: 2.0, fanfare: 3.0,
};

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface Note { n: number | null; beats: number }
/** Play a line of notes from `t`; returns its length in seconds. */
function line(s: SynthCtx, wave: OscillatorType, notes: Note[], beat: number, o: { gain: number; decay?: number; lp?: number; t?: number; detune?: number }): number {
  const { ctx, out } = s;
  let t = o.t ?? s.t;
  const start = t;
  const dest: AudioNode = o.lp ? (() => { const f = filter(ctx, 'lowpass', o.lp!, 0.7); f.connect(out); return f; })() : out;
  for (const nt of notes) {
    const dur = nt.beats * beat;
    if (nt.n !== null) {
      const len = o.decay ? Math.min(dur, o.decay) : dur * 0.9;
      const osc = tone(s, wave, hz(nt.n), hz(nt.n), t, len);
      if (o.detune) osc.detune.value = o.detune;
      const e = env(ctx, t, 0.008, o.gain, Math.max(0.03, len - 0.008));
      osc.connect(e).connect(dest);
    }
    t += dur;
  }
  return t - start;
}
const N = (n: number | null, beats = 1): Note => ({ n, beats });

function thump(s: SynthCtx, t: number, f0 = 120, gain = 0.6): void {
  const o = tone(s, 'sine', f0, 42, t, 0.22);
  const e = env(s.ctx, t, 0.004, gain, 0.2);
  o.connect(e).connect(s.out);
}

function clap(s: SynthCtx, t: number, gain = 0.35): void {
  const n = noiseSrc(s, t, 0.12);
  const bp = filter(s.ctx, 'bandpass', 1500, 0.9);
  const e = env(s.ctx, t, 0.002, gain, 0.1);
  n.connect(bp).connect(e).connect(s.out);
}

function click(s: SynthCtx, t: number, hp = 3000, gain = 0.25, len = 0.015): void {
  const n = noiseSrc(s, t, len + 0.02);
  const f = filter(s.ctx, 'highpass', hp, 0.7);
  const e = env(s.ctx, t, 0.001, gain, len);
  n.connect(f).connect(e).connect(s.out);
}

export function emoteSynth(kind: EmoteSound, s: SynthCtx): number {
  const { ctx, out, t } = s;
  switch (kind) {
    case 'raspberry': {
      // Pbbbbt: a buzzing low saw, flapping at ~28 Hz, through a lippy band-pass.
      const o = tone(s, 'sawtooth', 85, 70, t, 0.75);
      const n = noiseSrc(s, t, 0.75);
      const flap = ctx.createGain();
      flap.gain.value = 0.5;
      const lfo = tone(s, 'square', 28, 24, t, 0.75);
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(flap.gain);
      const bp = filter(ctx, 'bandpass', 700, 0.8);
      const nb = ctx.createGain();
      nb.gain.value = 0.25;
      const e = env(ctx, t, 0.02, 0.9, 0.7);
      o.connect(flap);
      n.connect(nb).connect(flap);
      flap.connect(bp).connect(e).connect(out);
      return 0.8;
    }
    case 'aww': {
      // A soft, falling "awww" (two voices, a little vibrato).
      for (const [f0, f1, d] of [[520, 380, 0], [523, 382, 7]] as const) {
        const o = tone(s, 'triangle', f0, f1, t, 0.85);
        o.detune.value = d;
        const vib = tone(s, 'sine', 5.5, 5.5, t, 0.85);
        const vd = ctx.createGain();
        vd.gain.value = 9;
        vib.connect(vd).connect(o.frequency);
        const lp = filter(ctx, 'lowpass', 1400);
        const e = env(ctx, t, 0.12, 0.22, 0.7);
        o.connect(lp).connect(e).connect(out);
      }
      return 0.95;
    }
    case 'sob': {
      // Hu-hu-hu... *sniff*.
      for (let i = 0; i < 3; i++) {
        const ti = t + i * 0.2;
        const o = tone(s, 'triangle', 400 - i * 25, 300 - i * 25, ti, 0.15);
        const e = env(ctx, ti, 0.01, 0.25, 0.13);
        o.connect(e).connect(out);
        const n = noiseSrc(s, ti, 0.15);
        const bp = filter(ctx, 'bandpass', 900, 1.5);
        const en = env(ctx, ti, 0.01, 0.12, 0.12);
        n.connect(bp).connect(en).connect(out);
      }
      const sn = noiseSrc(s, t + 0.75, 0.3);
      const hp = filter(ctx, 'highpass', 2500, 0.7);
      hp.frequency.setValueAtTime(2000, t + 0.75);
      hp.frequency.exponentialRampToValueAtTime(5000, t + 1.0);
      const es = env(ctx, t + 0.75, 0.15, 0.18, 0.1);
      sn.connect(hp).connect(es).connect(out);
      return 1.15;
    }
    case 'nyah': {
      // The playground chant.
      return line(s, 'square', [N(67, 1.2), N(64, 1.2), N(69, 0.8), N(67, 0.8), N(64, 1.6)], 0.15, { gain: 0.13, lp: 1800 });
    }
    case 'bleep': {
      // The censor's bleep: flat, loud and 1 kHz.
      const o = tone(s, 'sine', 1000, 1000, t, 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.005);
      g.gain.setValueAtTime(0.22, t + 0.46);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(out);
      return 0.55;
    }
    case 'tape': {
      // A tape measure pulled out (zip), then snapping back.
      const n = noiseSrc(s, t, 0.55);
      const bp = filter(ctx, 'bandpass', 1800, 2);
      bp.frequency.setValueAtTime(1800, t);
      bp.frequency.exponentialRampToValueAtTime(5200, t + 0.5);
      const e = env(ctx, t, 0.03, 0.3, 0.5);
      n.connect(bp).connect(e).connect(out);
      for (let i = 0; i < 9; i++) click(s, t + i * 0.055, 4000, 0.08, 0.008);
      click(s, t + 1.6, 1200, 0.5, 0.04);
      return 1.7;
    }
    case 'kaching': {
      // Ka-ching: the drawer's clunk, then the bell.
      const n = noiseSrc(s, t, 0.08);
      const lp = filter(ctx, 'lowpass', 900);
      const e = env(ctx, t, 0.002, 0.5, 0.07);
      n.connect(lp).connect(e).connect(out);
      for (const [f, g] of [[2637, 0.18], [3520, 0.1], [5274, 0.05]] as const) {
        const o = tone(s, 'sine', f, f, t + 0.09, 1.2);
        const eb = env(ctx, t + 0.09, 0.002, g, 1.1);
        o.connect(eb).connect(out);
      }
      return 1.35;
    }
    case 'jig': {
      // A tin whistle in 6/8, over a bodhrán.
      const L = line(s, 'triangle', [
        N(74), N(78), N(81), N(86), N(81), N(78), N(79), N(83), N(79), N(78), N(74), N(76),
      ], 1 / 6, { gain: 0.16, lp: 3500 });
      for (let i = 0; i < 4; i++) thump(s, t + i * 0.5, 110, 0.35);
      return L;
    }
    case 'waltz': {
      // A music box, three-four.
      const L = line(s, 'sine', [
        N(84), N(88), N(91), N(96), N(91), N(88), N(89), N(93), N(96), N(95), N(91), N(86),
      ], 0.18, { gain: 0.14, decay: 0.5 });
      for (let i = 0; i < 4; i++) {
        const o = tone(s, 'sine', hz([48, 53, 55, 48][i]), hz([48, 53, 55, 48][i]), t + i * 0.54, 0.4);
        const e = env(ctx, t + i * 0.54, 0.005, 0.12, 0.35);
        o.connect(e).connect(out);
      }
      return L;
    }
    case 'shimmy': {
      // Sly bass and finger snaps.
      line(s, 'triangle', [N(36), N(null), N(43), N(null), N(46), N(45), N(43), N(null)], 0.25, { gain: 0.3, lp: 800 });
      line(s, 'square', [N(null, 2), N(63, 0.5), N(65, 0.5), N(67, 1), N(null, 2), N(70, 0.5), N(67, 1.5)], 0.25, { gain: 0.07, lp: 1400 });
      for (const b of [1, 3, 5, 7]) click(s, t + b * 0.25, 2500, 0.3, 0.02);
      return 2.0;
    }
    case 'stomp': {
      // Stomp, stomp, clap.
      for (const b of [0, 1]) {
        thump(s, t + b * 1.0, 95, 0.8);
        thump(s, t + b * 1.0 + 0.25, 95, 0.8);
        clap(s, t + b * 1.0 + 0.5, 0.4);
      }
      return 2.0;
    }
    case 'dirge': {
      // Chopin's funeral march (public domain), on a wheezy organ.
      const notes = [N(58, 1), N(58, 0.75), N(58, 0.25), N(58, 1), N(61, 0.75), N(60, 0.25), N(60, 0.75), N(58, 0.25), N(58, 0.75), N(57, 0.25), N(58, 1)];
      const L = line(s, 'sawtooth', notes, 0.6, { gain: 0.08, lp: 900 });
      line(s, 'sawtooth', notes.map((x) => N(x.n === null ? null : x.n - 12, x.beats)), 0.6, { gain: 0.06, lp: 600, detune: 6 });
      return L;
    }
    case 'creak': {
      // A hip in need of oil: a slow creak, a pop.
      for (const at of [0, 1.0]) {
        const o = tone(s, 'sawtooth', 48, 62, t + at, 0.6);
        const jit = tone(s, 'square', 13, 17, t + at, 0.6);
        const jd = ctx.createGain();
        jd.gain.value = 10;
        jit.connect(jd).connect(o.frequency);
        const bp = filter(ctx, 'bandpass', 950, 7);
        const e = env(ctx, t + at, 0.08, 0.6, 0.5);
        o.connect(bp).connect(e).connect(out);
        click(s, t + at + 0.62, 1500, 0.35, 0.02);
      }
      return 2.0;
    }
    case 'oi': {
      // OI!
      const o = tone(s, 'sawtooth', 280, 210, t, 0.32);
      const f1 = filter(ctx, 'bandpass', 750, 3);
      const f2 = filter(ctx, 'bandpass', 2300, 4);
      const e = env(ctx, t, 0.02, 0.5, 0.28);
      o.connect(f1).connect(e);
      o.connect(f2).connect(e);
      e.connect(out);
      return 0.4;
    }
    case 'hmm': {
      const o = tone(s, 'sine', 170, 175, t, 0.8);
      o.frequency.setValueAtTime(170, t);
      o.frequency.linearRampToValueAtTime(195, t + 0.35);
      o.frequency.linearRampToValueAtTime(160, t + 0.8);
      const e = env(ctx, t, 0.06, 0.35, 0.72);
      o.connect(e).connect(out);
      return 0.9;
    }
    case 'tsk': {
      for (let i = 0; i < 3; i++) click(s, t + i * 0.2, 3200, 0.35, 0.018);
      return 0.65;
    }
    case 'gasp': {
      const n = noiseSrc(s, t, 0.45);
      const bp = filter(ctx, 'bandpass', 800, 1.2);
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      const e = env(ctx, t, 0.25, 0.45, 0.15);
      n.connect(bp).connect(e).connect(out);
      return 0.5;
    }
    case 'kiss': {
      // Mwah!
      const o = tone(s, 'sine', 500, 1300, t, 0.09);
      const e = env(ctx, t, 0.01, 0.3, 0.08);
      o.connect(e).connect(out);
      click(s, t + 0.09, 2000, 0.4, 0.012);
      const a = tone(s, 'triangle', 480, 420, t + 0.12, 0.2);
      const ea = env(ctx, t + 0.12, 0.02, 0.18, 0.18);
      a.connect(ea).connect(out);
      return 0.4;
    }
    case 'thud': {
      thump(s, t + 1.4, 100, 0.7);
      const n = noiseSrc(s, t + 1.4, 0.2);
      const lp = filter(ctx, 'lowpass', 300);
      const e = env(ctx, t + 1.4, 0.003, 0.5, 0.18);
      n.connect(lp).connect(e).connect(out);
      return 1.7;
    }
    case 'ragtime': {
      // Stride piano: bass, chord, bass, chord, and a syncopated tune on top.
      const beat = 0.25;
      for (let i = 0; i < 8; i++) {
        const ti = t + i * beat;
        if (i % 2 === 0) line(s, 'triangle', [N(i % 4 === 0 ? 48 : 43, 1)], beat, { gain: 0.22, decay: 0.2, t: ti });
        else for (const n of [64, 67, 72]) line(s, 'triangle', [N(n, 1)], beat, { gain: 0.07, decay: 0.15, t: ti });
      }
      line(s, 'square', [N(76, 0.5), N(79, 1), N(76, 0.5), N(null, 0.5), N(72, 0.5), N(74, 1), N(76, 1.5), N(72, 2.5)], beat, { gain: 0.06, lp: 2500 });
      return 2.0;
    }
    case 'twist': {
      // A walking bass and handclaps.
      const L = line(s, 'square', [N(48), N(52), N(55), N(57), N(58), N(57), N(55), N(52)], 0.25, { gain: 0.12, lp: 700 });
      for (const b of [1, 3, 5, 7]) clap(s, t + b * 0.25, 0.25);
      return L;
    }
    case 'fanfare': {
      // Ta-da! (still alive)
      const L = line(s, 'sawtooth', [N(67, 0.5), N(72, 0.5), N(76, 0.5), N(79, 2)], 0.22, { gain: 0.12, lp: 2200 });
      line(s, 'sawtooth', [N(55, 0.5), N(60, 0.5), N(64, 0.5), N(67, 2)], 0.22, { gain: 0.08, lp: 1500, detune: 5 });
      return L;
    }
  }
}
