// Procedural ambience (WebAudio) for a 3 mm listener: wind in the blades, water, grasshoppers and crickets, bumblebees,
// distant birds, a far-off lawnmower, the giant's footsteps, and a music box. No samples.
import { clamp, smoothstep } from './noise.js';

export class Ambience {
  constructor(ctx) { this.ctx = ctx; this.ac = null; this.muted = false; this.tBird = 3; this.tBell = 20; this.tCheck = 0; this.nearWater = 0; this.nearTemple = 0; this.music = true; this.tNote = 6; this.deg = 5; this.phrase = 0; this.tPad = 2; this.root = 0; this.tHop = 4; this.tMow = 90; this.mow = null; }
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
    const co = ac.createOscillator(); co.frequency.value = 4300; const cm = ac.createGain(); cm.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 38; const lg = ac.createGain(); lg.gain.value = 0.5;
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.55; const lg2 = ac.createGain(); lg2.gain.value = 0.5;
    lfo.connect(lg); lg.connect(cm.gain); lfo2.connect(lg2); lg2.connect(cm.gain);
    co.connect(cm); cm.connect(this.cricket); co.start(); lfo.start(); lfo2.start();
    // a bumblebee: a buzzing sawtooth, filtered, wobbling in pitch as it turns
    this.bee = ac.createGain(); this.bee.gain.value = 0;
    const bo = ac.createOscillator(); bo.type = 'sawtooth'; bo.frequency.value = 185; this.beeOsc = bo;
    const bo2 = ac.createOscillator(); bo2.type = 'sawtooth'; bo2.frequency.value = 187.5;
    const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 600; bf.Q.value = 0.8;
    const bg = ac.createGain(); bg.gain.value = 0.5;
    bo.connect(bf); bo2.connect(bf); bf.connect(bg); bg.connect(this.bee); this.bee.connect(this.master); bo.start(); bo2.start();
    this.noiseBuf = buf;
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
    for (const [mul, amp] of [[1, 1], [3.0, 0.12], [5.97, 0.05]]) {
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
  scale(dark) { return dark > 0.5 ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; } // a music box: major by day, minor after dark
  noteF(deg, dark) { const sc = this.scale(dark); return 73.42 * Math.pow(2, (Math.floor(deg / 7) * 12 + sc[((deg % 7) + 7) % 7]) / 12); }
  melody(dt, dark) {
    const t = this.ac.currentTime + 0.05;
    this.tPad -= dt;
    if (this.tPad <= 0) { // a new chord drifts in while the last one fades
      this.root = [0, 3, 4, 0, 5, 1, 4][(Math.random() * 7) | 0];
      const dur = 15 + Math.random() * 8;
      this.pad(this.noteF(this.root + 7, dark), t, dur, 0.016, -0.3);
      this.pad(this.noteF(this.root + 11, dark), t + 1.5, dur - 1, 0.012, 0.3);
      this.pad(this.noteF(this.root + 16, dark), t + 3, dur - 2, 0.01, 0);
      if (Math.random() < 0.6) this.pad(this.noteF(this.root, dark), t, dur, 0.018, 0);
      this.tPad = dur * 0.62;
    }
    this.tNote -= dt;
    if (this.tNote > 0) return;
    if (this.phrase <= 0) { this.phrase = 3 + (Math.random() * 5 | 0); this.tNote = 7 + Math.random() * 12; this.deg = this.root + 28 + [0, 2, 4][(Math.random() * 3) | 0]; return; }
    this.phrase--;
    this.deg += [-2, -1, -1, 1, 1, 2, 4, -4][(Math.random() * 8) | 0];
    this.deg = Math.max(26, Math.min(38, this.deg));
    this.ping(this.noteF(this.deg, dark), t, 0.035, Math.random() * 1.2 - 0.6, 2.2);
    if (Math.random() < 0.3) this.ping(this.noteF(this.deg + 2, dark), t + 0.18, 0.02, Math.random() * 1.2 - 0.6, 2.2);
    this.tNote = [0.45, 0.45, 0.9, 0.9, 1.35, 1.8][(Math.random() * 6) | 0];
  }
  hopper() { // a grasshopper rubbing its legs: bursts of bright noise
    const ac = this.ac, t = ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8, n = 3 + (Math.random() * 6 | 0), vol = 0.05 + Math.random() * 0.05;
    for (let i = 0; i < n; i++) {
      const src = ac.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 1.5;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6500 + Math.random() * 1500; f.Q.value = 3;
      const g = ac.createGain(), t0 = t + i * 0.16;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      for (let k = 0; k < 6; k++) { g.gain.setValueAtTime(vol * (k % 2 ? 0.25 : 1), t0 + 0.012 * k); }
      g.gain.linearRampToValueAtTime(0, t0 + 0.09);
      let out = g; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
      src.connect(f); f.connect(g); out.connect(this.master); src.start(t0, Math.random() * 2); src.stop(t0 + 0.12);
    }
  }
  farBird() { // birds are giants here, far away and high above: soft, through a lot of air
    const ac = this.ac, t = ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8, f0 = 2200 + Math.random() * 1600, n = 3 + (Math.random() * 5 | 0);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(this.musicBus);
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = t + i * (0.11 + Math.random() * 0.06);
      o.frequency.setValueAtTime(f0 * (1 + Math.random() * 0.2), t0); o.frequency.exponentialRampToValueAtTime(f0 * (0.75 + Math.random() * 0.5), t0 + 0.09);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.012, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      let out = g; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
      o.connect(g); out.connect(lp); o.start(t0); o.stop(t0 + 0.12);
    }
  }
  stomp(d) { // the giant's step: you feel it before you hear it
    if (!this.ac || this.ac.state !== 'running') return;
    const ac = this.ac, t = ac.currentTime + 0.02 + d / 343000 * 1000 * 0.001, v = clamp(1.4 - d / 4500, 0, 1) * 0.35;
    if (v <= 0.01) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1);
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g2 = ac.createGain(); g2.gain.setValueAtTime(v * 0.6, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f); f.connect(g2); g2.connect(this.master); src.start(t); src.stop(t + 0.7);
  }
  mower(on) { // somebody, somewhere, is mowing their lawn
    const ac = this.ac, t = ac.currentTime;
    if (on && !this.mow) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 96;
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 48.5;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 9);
      const wob = ac.createOscillator(); wob.frequency.value = 0.13; const wg = ac.createGain(); wg.gain.value = 9; wob.connect(wg); wg.connect(o.frequency);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start(); wob.start();
      this.mow = { o, o2, wob, g };
    } else if (!on && this.mow) {
      const m = this.mow; this.mow = null;
      m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(m.g.gain.value, t); m.g.gain.linearRampToValueAtTime(0, t + 8);
      for (const o of [m.o, m.o2, m.wob]) o.stop(t + 8.5);
    }
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
    }
    const night = U.uNight.value, s = U.uSeason.value, speed = p.vel.length(), alt = smoothstep(20, 400, p.agl);
    const gust = 0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.071 + 1);
    const set = (g, v) => g.gain.setTargetAtTime(v, now, 0.4);
    set(this.wind.g, 0.10 + 0.16 * gust + 0.3 * alt + clamp(speed / 120, 0, 0.5) + 0.1 * s.w);
    set(this.windHi.g, 0.015 + 0.03 * gust + clamp(speed / 200, 0, 0.25));
    set(this.water.g, this.nearWater * 0.16); set(this.waterLo.g, this.nearWater * 0.3);
    set(this.cricket, night * (s.y * 0.05 + s.z * 0.04 + s.x * 0.012) * (1 - alt));
    const low = 1 - smoothstep(40, 200, p.agl);
    if (this.music) this.melody(dt, Math.max(night, U.uGlow.value));
    this.tBird -= dt;
    if (this.tBird < 0) { this.tBird = 3 + Math.random() * 9; if (night < 0.5 && s.w < 0.7 && Math.random() < 0.7) this.farBird(); }
    this.tHop -= dt;
    if (this.tHop < 0) { this.tHop = 1.5 + Math.random() * 5; if (night < 0.4 && (s.y + s.z * 0.6) > 0.4 && low > 0.2 && Math.random() < 0.8) this.hopper(); }
    // bumblebee: louder as it passes close
    const bd = ctx.birds ? ctx.birds.nearest(p.pos, 'bee') : 1e9;
    set(this.bee, clamp(1 - bd / 260, 0, 1) ** 2 * 0.09);
    this.beeOsc.frequency.setTargetAtTime(180 + 18 * Math.sin(now * 1.7), now, 0.2);
    this.tMow -= dt;
    if (this.tMow < 0) {
      if (this.mow) { this.mower(false); this.tMow = 240 + Math.random() * 300; }
      else if (night < 0.3 && s.y > 0.5) { this.mower(true); this.tMow = 30 + Math.random() * 40; } else this.tMow = 60;
    }
  }
}
