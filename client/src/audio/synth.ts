// Synthesised sound effects (WebAudio only, no files). Each voice schedules
// its own nodes into `out` starting at `t` and returns its duration.

export type SfxKind =
  | 'crash' | 'step' | 'quill' | 'whistle' | 'cane' | 'oof' | 'ding' | 'thunder' | 'clink' | 'tut' | 'bless' | 'pop' | 'summon'
  | 'whoosh';

export interface SynthCtx { ctx: AudioContext; noise: AudioBuffer; out: AudioNode; t: number; rand: () => number }

function env(ctx: AudioContext, t: number, attack: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noiseSrc(s: SynthCtx, t: number, dur: number): AudioBufferSourceNode {
  const n = s.ctx.createBufferSource();
  n.buffer = s.noise;
  n.loop = true;
  n.start(t, s.rand() * 1.5, dur + 0.05);
  return n;
}

function tone(s: SynthCtx, type: OscillatorType, f0: number, f1: number, t: number, dur: number): OscillatorNode {
  const o = s.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filter(ctx: AudioContext, type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

export function synth(kind: SfxKind, s: SynthCtx): number {
  const { ctx, out, t, rand } = s;
  switch (kind) {
    case 'crash': {
      // Porcelain: a bright noise burst, ringing partials, and a dull thud.
      const n = noiseSrc(s, t, 0.9);
      const hp = filter(ctx, 'highpass', 1800, 0.7);
      const e = env(ctx, t, 0.003, 1.0, 0.6);
      n.connect(hp).connect(e).connect(out);
      for (let i = 0; i < 6; i++) {
        const f = 2200 + rand() * 4200;
        const o = tone(s, 'sine', f, f * 0.98, t + rand() * 0.08, 0.9);
        const g = env(ctx, t, 0.002, 0.12, 0.4 + rand() * 0.6);
        o.connect(g).connect(out);
      }
      const thud = tone(s, 'sine', 140, 60, t, 0.25);
      const tg = env(ctx, t, 0.005, 0.7, 0.22);
      thud.connect(tg).connect(out);
      return 1.2;
    }
    case 'step': {
      const n = noiseSrc(s, t, 0.1);
      const lp = filter(ctx, 'lowpass', 500 + rand() * 300, 1.5);
      const e = env(ctx, t, 0.004, 0.5, 0.07);
      n.connect(lp).connect(e).connect(out);
      return 0.12;
    }
    case 'quill': {
      for (let i = 0; i < 4; i++) {
        const t0 = t + i * 0.14 + rand() * 0.05;
        const n = noiseSrc(s, t0, 0.12);
        const bp = filter(ctx, 'bandpass', 3500 + rand() * 2500, 4);
        const e = env(ctx, t0, 0.01, 0.35, 0.09);
        n.connect(bp).connect(e).connect(out);
      }
      return 0.7;
    }
    case 'whistle': {
      // Hearing-aid feedback squeal.
      const o = tone(s, 'sine', 2600, 3400, t, 0.9);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lg = ctx.createGain();
      lg.gain.value = 60;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 1);
      const e = env(ctx, t, 0.08, 0.25, 0.8);
      o.connect(e).connect(out);
      return 1;
    }
    case 'cane': {
      const o = tone(s, 'triangle', 220, 120, t, 0.12);
      const e = env(ctx, t, 0.002, 0.9, 0.12);
      o.connect(e).connect(out);
      const n = noiseSrc(s, t, 0.04);
      const bp = filter(ctx, 'bandpass', 2200, 2);
      const e2 = env(ctx, t, 0.001, 0.6, 0.03);
      n.connect(bp).connect(e2).connect(out);
      return 0.2;
    }
    case 'oof': {
      const f0 = 170 + rand() * 60;
      const o = tone(s, 'sawtooth', f0, f0 * 0.55, t, 0.32);
      const f1 = filter(ctx, 'bandpass', 650, 3);
      const f2 = filter(ctx, 'bandpass', 1100, 4);
      const e = env(ctx, t, 0.02, 0.9, 0.3);
      o.connect(f1).connect(e);
      o.connect(f2).connect(e);
      e.connect(out);
      return 0.4;
    }
    case 'ding': {
      [1318.5, 1760].forEach((f, i) => {
        const t0 = t + i * 0.13;
        const o = tone(s, 'sine', f, f, t0, 1.2);
        const o2 = tone(s, 'sine', f * 2, f * 2, t0, 0.6);
        const e = env(ctx, t0, 0.005, 0.4, 1.1);
        const e2 = env(ctx, t0, 0.005, 0.1, 0.5);
        o.connect(e).connect(out);
        o2.connect(e2).connect(out);
      });
      return 1.5;
    }
    case 'thunder': {
      const n = noiseSrc(s, t, 3.2);
      const lp = filter(ctx, 'lowpass', 220, 0.8);
      const e = env(ctx, t + 0.1, 0.25, 1.2, 2.8);
      n.connect(lp).connect(e).connect(out);
      return 3.4;
    }
    case 'clink': {
      [3800, 5200].forEach((f, i) => {
        const o = tone(s, 'sine', f, f, t + i * 0.09, 0.3);
        const e = env(ctx, t + i * 0.09, 0.002, 0.25, 0.25);
        o.connect(e).connect(out);
      });
      return 0.5;
    }
    case 'tut': {
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.17;
        const n = noiseSrc(s, t0, 0.03);
        const bp = filter(ctx, 'bandpass', 2600, 6);
        const e = env(ctx, t0, 0.001, 0.9, 0.025);
        n.connect(bp).connect(e).connect(out);
      }
      return 0.4;
    }
    case 'bless': {
      [880, 1108.7, 1318.5].forEach((f, i) => {
        const t0 = t + i * 0.08;
        const o = tone(s, 'sine', f, f, t0, 0.7);
        const e = env(ctx, t0, 0.01, 0.22, 0.6);
        o.connect(e).connect(out);
      });
      return 0.9;
    }
    case 'summon': {
      // A little brass hand bell.
      [1046.5, 1568].forEach((f) => {
        for (let k = 0; k < 3; k++) {
          const t0 = t + k * 0.22;
          const o = tone(s, 'triangle', f, f, t0, 0.5);
          const e = env(ctx, t0, 0.003, 0.18, 0.45);
          o.connect(e).connect(out);
        }
      });
      return 1;
    }
    case 'whoosh': {
      // A shove's swing through the air: band-passed noise sweeping up, then away.
      const n = noiseSrc(s, t, 0.3);
      const bp = filter(ctx, 'bandpass', 380, 1.4);
      bp.frequency.setValueAtTime(380, t);
      bp.frequency.exponentialRampToValueAtTime(1900, t + 0.13);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.27);
      const e = env(ctx, t, 0.04, 0.7, 0.22);
      n.connect(bp).connect(e).connect(out);
      return 0.32;
    }
    case 'pop':
    default: {
      const o = tone(s, 'sine', 660, 990, t, 0.06);
      const e = env(ctx, t, 0.003, 0.2, 0.06);
      o.connect(e).connect(out);
      return 0.1;
    }
  }
}
