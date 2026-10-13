// All sound is synthesized with WebAudio: gunfire, hitmarkers, explosions and a trap beat.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.musicOn = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.55; this.music.connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // shared echo for the beat
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 60 / 140 * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.music);
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    this.dist.curve = curve;
    this.dist.connect(this.music);
  }

  setSfx(v) { this.sfxVol = v; if (this.sfx) this.sfx.gain.value = v; }
  setMusic(v) { this.musicVol = v; this.applyMusicGain(); }
  applyMusicGain(duck) { if (this.music) this.music.gain.setTargetAtTime(this.musicVol * 0.55 * (duck ? 0.35 : 1), this.ctx.currentTime, 0.3); }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * 0.5, dur + 0.05);
    return s;
  }

  out(pan, gain) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  // spec: { f, d, g, thump } from weapon config
  shot(spec, dist = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const atten = 1 / (1 + dist * 0.07);
    if (atten < 0.03) return;
    const out = this.out(pan, spec.g * atten * 0.55);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 9000 / (1 + dist * 0.05);
    lp.connect(out);
    const n = this.noiseSrc(t, spec.d);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = spec.f; bp.Q.value = 0.7;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(1.0, t); ng.gain.exponentialRampToValueAtTime(0.001, t + spec.d);
    n.connect(bp); bp.connect(ng); ng.connect(lp);
    const crack = this.noiseSrc(t, 0.03);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const cg = this.ctx.createGain(); cg.gain.setValueAtTime(0.7, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    crack.connect(hp); hp.connect(cg); cg.connect(lp);
    if (spec.thump) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(spec.thump * 2, t); o.frequency.exponentialRampToValueAtTime(spec.thump * 0.6, t + 0.12);
      const og = this.ctx.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + 0.16);
    }
    // distant tail
    if (dist > 15) {
      const tail = this.noiseSrc(t + 0.02, 0.4);
      const tl = this.ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 600;
      const tg = this.ctx.createGain(); tg.gain.setValueAtTime(0.25, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      tail.connect(tl); tl.connect(tg); tg.connect(out);
    }
  }

  tone(freq, dur, type = 'sine', gain = 0.3, when = 0, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }

  hitmarker(head) {
    if (!this.ctx) return;
    this.tone(head ? 3400 : 2600, 0.045, 'square', 0.12);
    this.tone(head ? 5200 : 1800, 0.03, 'triangle', 0.12);
    if (head) this.tone(1200, 0.08, 'sine', 0.15, 0.0, 2400);
  }
  kill() { this.tone(1567, 0.09, 'triangle', 0.22); this.tone(2093, 0.16, 'triangle', 0.22, 0.07); }
  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.noiseSrc(t, 0.12);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(lp); lp.connect(g); g.connect(this.sfx);
  }
  click() { this.tone(900, 0.03, 'square', 0.08); }
  reload() { this.tone(500, 0.04, 'square', 0.1); this.tone(320, 0.05, 'square', 0.1, 0.12); this.tone(1100, 0.04, 'square', 0.1, 0.35); }
  pickup() { this.tone(880, 0.07, 'triangle', 0.2); this.tone(1320, 0.1, 'triangle', 0.2, 0.06); }
  beep(hi) { this.tone(hi ? 1320 : 880, 0.12, 'sine', 0.2); }
  swish() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.noiseSrc(t, 0.15);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(4000, t + 0.12);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(bp); bp.connect(g); g.connect(this.sfx);
  }
  streak() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'sawtooth', 0.08, i * 0.08));
  }
  capture(good) {
    if (good) [659, 880, 1175].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, i * 0.1));
    else [440, 370, 311].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.18, i * 0.1));
  }
  jet() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.noiseSrc(t, 1.4);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2000, t + 0.7); bp.frequency.exponentialRampToValueAtTime(200, t + 1.4);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.01, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    n.connect(bp); bp.connect(g); g.connect(this.sfx);
  }

  explosion(dist = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const atten = 1 / (1 + dist * 0.04);
    const out = this.out(pan, 1.1 * atten);
    const n = this.noiseSrc(t, 1.2);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000 / (1 + dist * 0.03), t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    n.connect(lp); lp.connect(g); g.connect(out);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const og = this.ctx.createGain(); og.gain.setValueAtTime(1, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.75);
  }

  // ---------- trap beat ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.bpm = 140;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.bar = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    const spb = 60 / this.bpm / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(s, t, spb) {
    const bar = Math.floor(s / 16);
    const i = s % 16;
    // C minor-ish: root C1 = 32.7 Hz
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // hats: 8ths with rolls
    const roll = (bar === 1 && i >= 12) || (bar === 3 && i >= 8 && i < 12);
    const triplet = bar === 3 && i >= 14;
    if (triplet) { for (let k = 0; k < 3; k++) this.hat(t + k * spb / 3 * 2 / 2, 0.05); }
    else if (roll) { this.hat(t, 0.06); this.hat(t + spb / 2, 0.045); }
    else if (i % 2 === 0) this.hat(t, i % 4 === 0 ? 0.08 : 0.055);
    // clap on beat 3 (half time)
    if (i === 8) this.clap(t);
    if (bar === 3 && i === 15) this.clap(t, 0.5);
    // 808 pattern
    const pat808 = [
      { 0: 36, 3: 36, 7: 43, 10: 36 },
      { 0: 36, 6: 39, 11: 41, 14: 43 },
      { 0: 36, 3: 36, 7: 43, 10: 36, 13: 34 },
      { 0: 39, 4: 39, 6: 41, 10: 36, 12: 31 },
    ][bar];
    if (pat808[i] !== undefined) this.bass(t, midi(pat808[i] - 12), spb * 5);
    // bell melody (dark arp)
    const mel = [
      { 0: 72, 3: 75, 6: 79, 8: 77, 11: 75, 14: 74 },
      { 0: 72, 3: 75, 6: 79, 8: 82, 11: 80, 14: 79 },
      { 0: 72, 3: 75, 6: 79, 8: 77, 11: 75, 14: 74 },
      { 0: 75, 3: 74, 6: 72, 8: 71, 12: 67 },
    ][bar];
    if (mel[i] !== undefined) this.bell(t, midi(mel[i]));
    if (i === 0 && bar === 0) {
      // pad
      for (const m of [60, 63, 67]) this.pad(t, midi(m), spb * 32);
    }
  }

  hat(t, gain) {
    const n = this.noiseSrc(t, 0.04);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp); hp.connect(g); g.connect(this.music);
  }
  clap(t, gain = 0.6) {
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.012;
      const n = this.noiseSrc(tt, 0.18);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(gain * (k === 2 ? 1 : 0.5), tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (k === 2 ? 0.18 : 0.02));
      n.connect(bp); bp.connect(g); g.connect(this.music);
    }
  }
  bass(t, f, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 3.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.setValueAtTime(0.9, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.dist); o.start(t); o.stop(t + dur + 0.05);
  }
  bell(t, f) {
    for (const [mult, gain, type] of [[1, 0.13, 'sine'], [2, 0.05, 'triangle'], [3.01, 0.03, 'sine']]) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g); g.connect(this.music); g.connect(this.delay); o.start(t); o.stop(t + 0.95);
    }
  }
  pad(t, f, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f / 2;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + 1.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.1);
  }
}
