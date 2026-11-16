// Procedural ambience (WebAudio): wind, water, birdsong, crickets, temple bell. No samples.
import { clamp, smoothstep } from './noise.js';

export class Ambience {
  constructor(ctx) { this.ctx = ctx; this.ac = null; this.muted = false; this.tBird = 3; this.tBell = 20; this.tCheck = 0; this.nearWater = 0; this.nearTemple = 0; this.music = true; this.tNote = 6; this.deg = 5; this.phrase = 0; }
  start() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = this.ac = new AC();
    this.master = ac.createGain(); this.master.gain.value = 0.0; this.master.connect(ac.destination);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.6, ac.currentTime + 3);
    // small hall reverb for the koto
    const rl = Math.floor(ac.sampleRate * 2.8), ir = ac.createBuffer(2, rl, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const q = ir.getChannelData(c); for (let i = 0; i < rl; i++) q[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6); }
    this.rev = ac.createConvolver(); this.rev.buffer = ir;
    this.musicBus = ac.createGain(); this.musicBus.gain.value = 0.9;
    const wet = ac.createGain(); wet.gain.value = 0.5;
    this.musicBus.connect(this.master); this.musicBus.connect(this.rev); this.rev.connect(wet); wet.connect(this.master);
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    const noise = (freq, q, type = 'bandpass') => {
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { f, g };
    };
    this.wind = noise(420, 0.6); this.windHi = noise(1900, 0.9); this.water = noise(1500, 0.5); this.waterLo = noise(380, 0.7, 'lowpass');
    this.cricket = ac.createGain(); this.cricket.gain.value = 0; this.cricket.connect(this.master);
    const co = ac.createOscillator(); co.frequency.value = 4300; const cm = ac.createGain(); cm.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 38; const lg = ac.createGain(); lg.gain.value = 0.5;
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.55; const lg2 = ac.createGain(); lg2.gain.value = 0.5;
    lfo.connect(lg); lg.connect(cm.gain); lfo2.connect(lg2); lg2.connect(cm.gain);
    co.connect(cm); cm.connect(this.cricket); co.start(); lfo.start(); lfo2.start();
  }
  tone(freq, t0, dur, vol, type = 'sine', freqEnd = null, pan = 0) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  pluck(freq, t, vol, pan = 0) { // koto-like plucked string
    const ac = this.ac, g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(Math.min(7000, freq * 9), t); f.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 1.6), t + 0.9);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    for (const [mul, type, amp] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3.01, 'sine', 0.12]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = type; og.gain.value = amp;
      o.frequency.setValueAtTime(freq * mul * 1.012, t); o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.07);
      o.connect(og); og.connect(f); o.start(t); o.stop(t + 2.7);
    }
    let out = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    f.connect(g); out.connect(this.musicBus);
  }
  melody(dt, night) {
    this.tNote -= dt;
    if (this.tNote > 0) return;
    // yo scale by day (open, warm), in scale by night (a little wistful)
    const scale = night > 0.5 ? [0, 1, 5, 7, 8] : [0, 2, 5, 7, 9];
    const noteF = (deg) => 146.83 * Math.pow(2, (Math.floor(deg / 5) * 12 + scale[((deg % 5) + 5) % 5]) / 12);
    const t = this.ac.currentTime + 0.05, r = Math.random();
    if (this.phrase <= 0) { this.phrase = 4 + (Math.random() * 6 | 0); this.tNote = 5 + Math.random() * 9; this.deg = 4 + (Math.random() * 5 | 0); if (Math.random() < 0.6) this.pluck(noteF(this.deg - 5), t, 0.06, -0.2); return; }
    this.phrase--;
    if (r < 0.14) { // rippling run
      const up = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 4; i++) this.pluck(noteF(this.deg + up * i), t + i * 0.13, 0.04 + i * 0.006, -0.3 + i * 0.2);
      this.deg += up * 3; this.tNote = 1.4 + Math.random() * 0.8;
    } else {
      this.deg += [-2, -1, -1, 1, 1, 2, 0][(Math.random() * 7) | 0];
      this.deg = Math.max(3, Math.min(12, this.deg));
      this.pluck(noteF(this.deg), t, 0.055, Math.random() * 0.6 - 0.3);
      if (r > 0.8) this.pluck(noteF(this.deg - 5), t + 0.02, 0.035, 0.1);
      this.tNote = [0.55, 0.55, 1.1, 1.1, 1.65, 2.2][(Math.random() * 6) | 0];
    }
  }
  uguisu() { // Japanese bush warbler: "hoo... ho-ke-kyo"
    const t = this.ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8, v = 0.035 + Math.random() * 0.03;
    this.tone(1250, t, 0.95, v, 'sine', 1420, pan);
    this.tone(2500, t + 1.02, 0.11, v * 1.3, 'sine', 2900, pan);
    this.tone(3300, t + 1.15, 0.13, v * 1.3, 'sine', 3600, pan);
    this.tone(2700, t + 1.3, 0.22, v * 1.2, 'sine', 1900, pan);
  }
  chirp() {
    const t = this.ac.currentTime + 0.05, pan = Math.random() * 1.8 - 0.9, n = 2 + (Math.random() * 4 | 0), f = 2600 + Math.random() * 2400;
    for (let i = 0; i < n; i++) this.tone(f * (1 + Math.random() * 0.15), t + i * 0.13, 0.09, 0.02 + Math.random() * 0.02, 'sine', f * (0.8 + Math.random() * 0.5), pan);
  }
  crow() {
    const t = this.ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < 3; i++) this.tone(620, t + i * 0.42, 0.28, 0.02, 'sawtooth', 480, pan);
  }
  bell() {
    const t = this.ac.currentTime + 0.05;
    for (const [f, v, d] of [[98, 0.22, 9], [196.5, 0.10, 7], [246, 0.07, 5], [331, 0.05, 4], [147, 0.08, 8], [492, 0.02, 2.5]]) this.tone(f, t, d, v * 0.9, 'sine', f * 0.996);
  }
  setMuted(m) { this.muted = m; if (this.ac) this.master.gain.linearRampToValueAtTime(m ? 0 : 0.6, this.ac.currentTime + 0.4); }
  update(dt) {
    if (!this.ac || this.ac.state !== 'running') return;
    const ctx = this.ctx, p = ctx.player, W = ctx.world, U = ctx.U, now = this.ac.currentTime;
    this.tCheck -= dt;
    if (this.tCheck < 0) {
      this.tCheck = 0.5;
      let wn = 0;
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; for (const r of [8, 22, 45]) { if (W.height(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r) < -0.2) { wn = Math.max(wn, 1 - r / 60); break; } } }
      this.nearWater = wn * (1 - smoothstep(10, 90, p.agl));
      let nt = 0;
      for (const s of W.sitesNear(p.pos.x - 250, p.pos.z - 250, p.pos.x + 250, p.pos.z + 250)) nt = Math.max(nt, 1 - Math.hypot(s.x - p.pos.x, s.z - p.pos.z) / 320);
      this.nearTemple = Math.max(0, nt);
    }
    const night = U.uNight.value, s = U.uSeason.value, speed = p.vel.length(), alt = smoothstep(20, 400, p.agl);
    const gust = 0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.071 + 1);
    const set = (g, v) => g.gain.setTargetAtTime(v, now, 0.4);
    set(this.wind.g, 0.10 + 0.16 * gust + 0.3 * alt + clamp(speed / 120, 0, 0.5) + 0.1 * s.w);
    set(this.windHi.g, 0.015 + 0.03 * gust + clamp(speed / 200, 0, 0.25));
    set(this.water.g, this.nearWater * 0.16); set(this.waterLo.g, this.nearWater * 0.3);
    set(this.cricket, night * (s.y * 0.05 + s.z * 0.04 + s.x * 0.012) * (1 - alt));
    const low = 1 - smoothstep(40, 200, p.agl);
    if (this.music) this.melody(dt, night);
    this.tBird -= dt;
    if (this.tBird < 0) {
      const day = 1 - night;
      this.tBird = 2 + Math.random() * 7;
      if (low > 0.2 && day > 0.5) {
        const r = Math.random();
        if (s.x > 0.5 && r < 0.4) this.uguisu(); else if (s.w > 0.5) { if (r < 0.3) this.crow(); } else if (r < 0.85) this.chirp(); else this.crow();
      }
    }
    this.tBell -= dt;
    if (this.tBell < 0) { this.tBell = 45 + Math.random() * 60; if (this.nearTemple > 0.15 && low > 0.3) this.bell(); }
  }
}
