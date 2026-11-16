// Procedural ambience (WebAudio): wind, water, alien calls, whale song, crystal chimes and slow drifting pads. No samples.
import { clamp, smoothstep } from './noise.js';

export class Ambience {
  constructor(ctx) { this.ctx = ctx; this.ac = null; this.muted = false; this.tBird = 3; this.tBell = 20; this.tCheck = 0; this.nearWater = 0; this.nearTemple = 0; this.music = true; this.tNote = 6; this.deg = 5; this.phrase = 0; this.tPad = 2; this.root = 0; this.tWhale = 25; }
  start() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = this.ac = new AC();
    this.master = ac.createGain(); this.master.gain.value = 0.0; this.master.connect(ac.destination);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.6, ac.currentTime + 3);
    // a long, soft hall
    const rl = Math.floor(ac.sampleRate * 4.5), ir = ac.createBuffer(2, rl, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const q = ir.getChannelData(c); for (let i = 0; i < rl; i++) q[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.2); }
    this.rev = ac.createConvolver(); this.rev.buffer = ir;
    this.musicBus = ac.createGain(); this.musicBus.gain.value = 0.9;
    const wet = ac.createGain(); wet.gain.value = 0.8;
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
    const co = ac.createOscillator(); co.frequency.value = 2350; const cm = ac.createGain(); cm.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7; const lg = ac.createGain(); lg.gain.value = 0.5;
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
  // glass tone: quick attack, long ringing tail (into the hall)
  ping(freq, t, vol, pan = 0, dur = 4.5) {
    const ac = this.ac, g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [mul, amp] of [[1, 1], [2.76, 0.28], [5.4, 0.1]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; og.gain.value = amp; o.frequency.value = freq * mul;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
    let out = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(this.musicBus);
  }
  // slow pad voice
  pad(freq, t, dur, vol, pan = 0) {
    const ac = this.ac, g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.6; f.frequency.setValueAtTime(freq * 2.2, t); f.frequency.linearRampToValueAtTime(freq * 4.5, t + dur * 0.5); f.frequency.linearRampToValueAtTime(freq * 2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const [det, type, amp] of [[-5, 'sawtooth', 0.32], [6, 'triangle', 0.7], [0, 'sine', 0.8]]) {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = type; og.gain.value = amp; o.frequency.value = freq; o.detune.value = det;
      o.connect(og); og.connect(f); o.start(t); o.stop(t + dur + 0.1);
    }
    let out = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    f.connect(g); out.connect(this.musicBus);
  }
  scale(dark) { return dark > 0.5 ? [0, 2, 3, 5, 7, 9, 10] : [0, 2, 4, 6, 7, 9, 11]; } // dorian after dark, lydian by day
  noteF(deg, dark) { const sc = this.scale(dark); return 73.42 * Math.pow(2, (Math.floor(deg / 7) * 12 + sc[((deg % 7) + 7) % 7]) / 12); }
  melody(dt, dark) {
    const t = this.ac.currentTime + 0.05;
    this.tPad -= dt;
    if (this.tPad <= 0) { // a new chord drifts in while the last one fades
      this.root = [0, 3, 4, 0, 5, 1, 4][(Math.random() * 7) | 0];
      const dur = 15 + Math.random() * 8;
      this.pad(this.noteF(this.root + 7, dark), t, dur, 0.035, -0.3);
      this.pad(this.noteF(this.root + 11, dark), t + 1.5, dur - 1, 0.026, 0.3);
      this.pad(this.noteF(this.root + 16, dark), t + 3, dur - 2, 0.022, 0);
      if (Math.random() < 0.6) this.pad(this.noteF(this.root, dark), t, dur, 0.04, 0);
      this.tPad = dur * 0.62;
    }
    this.tNote -= dt;
    if (this.tNote > 0) return;
    if (this.phrase <= 0) { this.phrase = 3 + (Math.random() * 5 | 0); this.tNote = 7 + Math.random() * 12; this.deg = this.root + 21 + [0, 2, 4][(Math.random() * 3) | 0]; return; }
    this.phrase--;
    this.deg += [-2, -1, -1, 1, 1, 2, 4, -4][(Math.random() * 8) | 0];
    this.deg = Math.max(19, Math.min(34, this.deg));
    this.ping(this.noteF(this.deg, dark), t, 0.03, Math.random() * 1.2 - 0.6);
    if (Math.random() < 0.3) this.ping(this.noteF(this.deg + 4, dark), t + 0.35, 0.018, Math.random() * 1.2 - 0.6);
    this.tNote = [1.1, 1.65, 2.2, 2.2, 3.3][(Math.random() * 5) | 0];
  }
  trill() { // small glowing things calling to each other
    const t = this.ac.currentTime + 0.05, pan = Math.random() * 1.8 - 0.9, f = 1500 + Math.random() * 1800, n = 3 + (Math.random() * 4 | 0), up = Math.random() < 0.5;
    for (let i = 0; i < n; i++) this.tone(f * Math.pow(up ? 1.09 : 0.92, i), t + i * 0.11, 0.16, 0.014 + Math.random() * 0.012, 'sine', f * Math.pow(up ? 1.09 : 0.92, i + 1.5), pan);
  }
  hoot() { // stilt walkers
    const t = this.ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8, f = 250 + Math.random() * 90;
    this.tone(f, t, 0.5, 0.03, 'triangle', f * 1.25, pan); this.tone(f * 1.25, t + 0.55, 0.9, 0.035, 'triangle', f * 0.94, pan);
  }
  whale(near) { // long calls drifting down from the sky
    const ac = this.ac, t = ac.currentTime + 0.05, pan = Math.random() * 1.4 - 0.7, vol = 0.05 * near;
    let at = t;
    for (let k = 0; k < 2 + (Math.random() * 2 | 0); k++) {
      const f0 = 95 + Math.random() * 90, f1 = f0 * (0.7 + Math.random() * 1.1), dur = 2.6 + Math.random() * 3;
      const g = ac.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, at + dur);
      for (const [mul, amp] of [[1, 1], [2, 0.4], [3, 0.16]]) {
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; og.gain.value = amp;
        o.frequency.setValueAtTime(f0 * mul, at); o.frequency.exponentialRampToValueAtTime(f1 * mul, at + dur * 0.7); o.frequency.exponentialRampToValueAtTime(f1 * mul * 0.9, at + dur);
        const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 4 + Math.random() * 2; vg.gain.value = f0 * mul * 0.012; vib.connect(vg); vg.connect(o.frequency); vib.start(at); vib.stop(at + dur + 0.1);
        o.connect(og); og.connect(g); o.start(at); o.stop(at + dur + 0.1);
      }
      let out = g;
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
      out.connect(this.musicBus);
      at += dur * 0.8;
    }
  }
  bell() { // crystals ringing near the old places
    const t = this.ac.currentTime + 0.05, base = [392, 440, 587, 659][(Math.random() * 4) | 0];
    for (let i = 0; i < 4; i++) this.ping(base * [1, 1.5, 2, 2.67][i] * (1 + (Math.random() - 0.5) * 0.004), t + i * 0.22 + Math.random() * 0.1, 0.022, Math.random() * 1.4 - 0.7, 6);
  }
  chime(size) { // a ring gate answering whoever passes through
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime + 0.02, f = 660 / Math.max(0.7, Math.min(2.6, size));
    this.ping(f, t, 0.07, 0, 7); this.ping(f * 1.5, t + 0.09, 0.045, -0.4, 7); this.ping(f * 2, t + 0.2, 0.03, 0.4, 6);
    this.tone(f * 0.25, t, 3.5, 0.06, 'sine', f * 0.249);
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
      this.nearCrystal = W.crystalField(p.pos.x, p.pos.z) * (1 - smoothstep(10, 60, p.agl)) * (W.height(p.pos.x, p.pos.z) > 0.5 ? 1 : 0);
    }
    const night = U.uNight.value, s = U.uSeason.value, speed = p.vel.length(), alt = smoothstep(20, 400, p.agl);
    const gust = 0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.071 + 1);
    const set = (g, v) => g.gain.setTargetAtTime(v, now, 0.4);
    set(this.wind.g, 0.10 + 0.16 * gust + 0.3 * alt + clamp(speed / 120, 0, 0.5) + 0.1 * s.w);
    set(this.windHi.g, 0.015 + 0.03 * gust + clamp(speed / 200, 0, 0.25));
    set(this.water.g, this.nearWater * 0.16); set(this.waterLo.g, this.nearWater * 0.3);
    set(this.cricket, U.uGlow.value * (0.012 + s.y * 0.012) * (1 - alt));
    const low = 1 - smoothstep(40, 200, p.agl);
    if (this.music) this.melody(dt, Math.max(night, U.uGlow.value));
    this.tBird -= dt;
    if (this.tBird < 0) {
      this.tBird = 2.5 + Math.random() * 8;
      if (low > 0.2) { const r = Math.random(); if (r < 0.55 + 0.25 * U.uGlow.value) this.trill(); else if (r > 0.86 && night < 0.6) this.hoot(); }
    }
    this.tWhale -= dt;
    if (this.tWhale < 0) {
      this.tWhale = 22 + Math.random() * 40;
      const d = ctx.birds ? ctx.birds.nearest(p.pos) : 1e9;
      if (d < 1100) this.whale(clamp(1.25 - d / 1000, 0.15, 1));
    }
    // crystal fields ring softly when the wind moves through them
    this.tCry = (this.tCry || 2) - dt * (0.4 + gust);
    if (this.tCry < 0) { this.tCry = 0.7 + Math.random() * 2.6; if (this.nearCrystal > 0.25) this.ping([1568, 1760, 2093, 2349, 2637, 3136][(Math.random() * 6) | 0], now + 0.05, 0.012 * this.nearCrystal * (0.5 + gust), Math.random() * 1.6 - 0.8, 3.5); }
    this.tBell -= dt;
    if (this.tBell < 0) { this.tBell = 45 + Math.random() * 60; if (this.nearTemple > 0.15 && low > 0.3) this.bell(); }
  }
}
