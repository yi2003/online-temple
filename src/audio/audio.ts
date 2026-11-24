// Every sound is synthesised with the Web Audio API — no recordings.
// The context is created on the first tap/keypress, as browsers require.
import { safeGet, safeSet } from '../state/store.ts';

export type Channel = 'master' | 'wind' | 'birds' | 'bells' | 'chant' | 'sfx';
export const CHANNELS: Channel[] = ['master', 'wind', 'birds', 'bells', 'chant', 'sfx'];
const DEFAULTS: Record<Channel, number> = { master: 0.7, wind: 0.35, birds: 0.35, bells: 0.5, chant: 0.6, sfx: 0.7 };
// v2: the calmer mix; older saved slider positions are ignored so everyone gets it
const MIXER_KEY = 'temple.mixer.v2';

class SoundEngine {
  ctx: AudioContext | null = null;
  private buses = {} as Record<Channel, GainNode>;
  levels: Record<Channel, number>;
  muted: boolean;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private birdTimer = 0;
  private bellTimer = 0;
  private chimeTimer = 0;

  constructor() {
    let saved: Partial<Record<Channel, number>> = {};
    try { saved = JSON.parse(safeGet(MIXER_KEY) || '{}'); } catch { /* ignore */ }
    this.levels = { ...DEFAULTS, ...saved };
    this.muted = safeGet('temple.muted') === '1';
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    for (const ch of CHANNELS) {
      const g = ctx.createGain();
      g.connect(ch === 'master' ? comp : this.buses.master);
      this.buses[ch] = g;
    }
    this.applyLevels();

    // 4 s of white noise reused by every noisy sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for the wind: a soft rumble rather than a hiss
    this.brown = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }

    this.startWind();
    this.birdTimer = 6;
    this.bellTimer = 6;
    this.chimeTimer = 15;
  }

  applyLevels() {
    if (!this.ctx) return;
    for (const ch of CHANNELS) {
      const g = this.buses[ch];
      if (!g) continue;
      const v = ch === 'master' ? (this.muted ? 0 : this.levels.master) : this.levels[ch] * (ch === 'chant' ? this.chantProx : 1);
      g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
    }
  }
  setLevel(ch: Channel, v: number) {
    this.levels[ch] = v;
    safeSet(MIXER_KEY, JSON.stringify(this.levels));
    this.applyLevels();
  }
  setMuted(m: boolean) {
    this.muted = m;
    safeSet('temple.muted', m ? '1' : '0');
    this.applyLevels();
  }

  /** Called every frame to schedule ambient events. */
  update(dt: number, opts: { nearBell: boolean }) {
    if (!this.ctx) return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdSong();
      this.birdTimer = 10 + Math.random() * 20;
    }
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      this.bell(opts.nearBell ? 0.5 : 0.25, true);
      this.bellTimer = 70 + Math.random() * 80;
    }
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.windChime();
      this.chimeTimer = 30 + Math.random() * 40;
    }
  }

  // ---------- building blocks ----------
  private noiseSrc(loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }
  private pan(value: number): StereoPannerNode {
    const p = this.ctx!.createStereoPanner();
    p.pan.value = value;
    return p;
  }

  private startWind() {
    const ctx = this.ctx!;
    // A single low, gentle layer of brown noise that swells slowly, like a breeze in the pines.
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(g.gain);
    const flfo = ctx.createOscillator();
    flfo.frequency.value = 0.031;
    const flfoGain = ctx.createGain();
    flfoGain.gain.value = 120;
    flfo.connect(flfoGain).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.buses.wind);
    src.start(0, Math.random() * 6);
    lfo.start();
    flfo.start();
  }

  private birdSong() {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const out = this.pan(Math.random() * 1.6 - 0.8);
    out.connect(this.buses.birds);
    const kind = Math.floor(Math.random() * 3);
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (kind === 0 ? 0.12 : 0.22) + Math.random() * 0.04;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const f = base * (1 + (Math.random() - 0.5) * 0.25);
      if (kind === 0) {
        // quick tweets
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.06);
      } else if (kind === 1) {
        // falling whistle
        o.frequency.setValueAtTime(f * 1.3, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.18);
      } else {
        // trill
        o.frequency.setValueAtTime(f, t);
        const tr = ctx.createOscillator();
        tr.frequency.value = 28;
        const tg = ctx.createGain();
        tg.gain.value = f * 0.08;
        tr.connect(tg).connect(o.frequency);
        tr.start(t);
        tr.stop(t + 0.2);
      }
      const dur = kind === 0 ? 0.07 : 0.19;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  /** Large bronze temple bell: inharmonic partials with long decays and slow beating. */
  bell(volume = 0.6, distant = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const f0 = 98;
    const out = ctx.createGain();
    out.gain.value = volume;
    let dest: AudioNode = this.buses.bells;
    if (distant) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      lp.connect(dest);
      dest = lp;
    }
    out.connect(dest);
    const partials: [number, number, number][] = [
      [0.5, 0.5, 14], [1, 0.8, 11], [1.19, 0.35, 8], [1.56, 0.4, 7], [2.0, 0.3, 6],
      [2.51, 0.22, 4.5], [2.66, 0.18, 4], [3.01, 0.15, 3.2], [4.1, 0.1, 2.2], [5.4, 0.06, 1.4],
    ];
    for (const [ratio, amp, decay] of partials) {
      for (const detune of [-0.6, 0.6]) {
        const o = ctx.createOscillator();
        o.frequency.value = f0 * ratio + detune * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp * 0.18, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.1);
      }
    }
    // the wooden striker's thud
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 300;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.2);
  }

  /** Small bells hanging from the eaves, stirred by the wind. */
  private windChime() {
    const ctx = this.ctx!;
    const out = this.pan(Math.random() * 1.2 - 0.6);
    out.connect(this.buses.bells);
    const hits = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hits; i++) {
      const t = ctx.currentTime + 0.05 + i * (0.25 + Math.random() * 0.4);
      const f = [1568, 1760, 2093, 2349][Math.floor(Math.random() * 4)];
      for (const [r, a, d] of [[1, 0.05, 2.2], [2.76, 0.02, 1.2], [5.4, 0.008, 0.6]] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = f * r;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + d + 0.05);
      }
    }
  }

  /** Bright hand bell / 磬 used for completions. */
  chime(pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    for (const [r, a, d] of [[1, 0.16, 3.5], [2.71, 0.06, 2], [5.2, 0.03, 1], [8.1, 0.01, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = 660 * pitch * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.buses.sfx);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  /** Singing bowl swell for rank-ups. */
  bowl() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    for (const [f, a] of [[220, 0.12], [221.5, 0.12], [596, 0.05], [1130, 0.02]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(g).connect(this.buses.sfx);
      o.start(t);
      o.stop(t + 7.1);
    }
  }

  /** Wooden fish: a hollow 'tok'. */
  woodfish(when = 0, bus: Channel = 'sfx', volume = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005 + when;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(820, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * volume, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g).connect(this.buses[bus]);
    o.start(t);
    o.stop(t + 0.15);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25 * volume, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp).connect(ng).connect(this.buses[bus]);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.05);
  }

  bead() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    for (const f of [2600, 3900]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(this.buses.sfx);
      o.start(t);
      o.stop(t + 0.06);
    }
  }

  private noiseBurst(freq: number, q: number, dur: number, vol: number, sweepTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(this.buses.sfx);
    n.start(t, Math.random() * 3);
    n.stop(t + dur + 0.05);
  }
  sweep() {
    this.noiseBurst(2500, 0.8, 0.45, 0.25, 1200);
  }
  water() {
    for (let i = 0; i < 10; i++) setTimeout(() => this.noiseBurst(500 + Math.random() * 900, 4, 0.25, 0.18), i * 90);
  }
  /** Soft cloth-shoe footfall on stone: a faint low thud, no hiss. */
  step() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.buses.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }

  // ---------- group chanting ----------
  private voice: { oscs: OscillatorNode[]; filters: BiquadFilterNode[]; gain: GainNode } | null = null;
  private static VOWELS: Record<string, [number, number]> = {
    a: [800, 1150], o: [450, 800], u: [325, 700], i: [300, 2200], e: [400, 1700],
  };

  /** Hum a chorus voice and move it through a syllable's vowel; `syl` like 'na', 'mo'. */
  chantSyllable(vowel: string, dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.voice) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.buses.chant);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 6;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 8;
      const f2g = ctx.createGain();
      f2g.gain.value = 0.5;
      f1.connect(gain);
      f2.connect(f2g).connect(gain);
      const oscs: OscillatorNode[] = [];
      // a small chorus of low male voices, slightly out of tune with each other
      for (const [f, pan] of [[110, -0.4], [110.6, 0.3], [109.3, 0], [55.2, 0.1]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const vib = ctx.createOscillator();
        vib.frequency.value = 4 + Math.random();
        const vg = ctx.createGain();
        vg.gain.value = 0.6;
        vib.connect(vg).connect(o.frequency);
        const p = this.pan(pan);
        const og = ctx.createGain();
        og.gain.value = 0.25;
        o.connect(og).connect(p);
        p.connect(f1);
        p.connect(f2);
        o.start();
        vib.start();
        oscs.push(o, vib);
      }
      this.voice = { oscs, filters: [f1, f2], gain };
    }
    const [a, b] = SoundEngine.VOWELS[vowel] ?? SoundEngine.VOWELS.a;
    const t = ctx.currentTime;
    this.voice.filters[0].frequency.setTargetAtTime(a, t, 0.04);
    this.voice.filters[1].frequency.setTargetAtTime(b, t, 0.04);
    const g = this.voice.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.9, t, 0.04);
    g.setTargetAtTime(0.35, t + dur * 0.7, 0.06);
  }
  /** Breath between phrases. */
  chantRest() {
    if (!this.ctx || !this.voice) return;
    const g = this.voice.gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(0.0, this.ctx.currentTime, 0.12);
  }
  /** Quieter far from the hall, but always audible: everyone shares the chant. */
  private chantProx = 1;
  setChantProximity(f: number) {
    if (Math.abs(f - this.chantProx) < 0.02) return;
    this.chantProx = f;
    this.applyLevels();
  }
  chantStop() {
    if (!this.ctx || !this.voice) return;
    const v = this.voice;
    v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    this.voice = null;
    setTimeout(() => v.oscs.forEach((o) => o.stop()), 3000);
  }
}

export const sound = new SoundEngine();
