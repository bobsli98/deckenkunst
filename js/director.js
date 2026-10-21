/* Deckenkunst – Regie: Szenenfolge, Überblendung, Sparmodus, Steuerung, Mikrofon, Wachhalten */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const qs = new URLSearchParams(location.search);

  const store = {
    get(k) { try { return localStorage.getItem('deckenkunst.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('deckenkunst.' + k, v); } catch (e) { /* egal */ } },
  };

  const cfg = {
    dauer: Math.max(10, +qs.get('dauer') || 150), // Sekunden pro Szene (± 25 %)
    fade: Math.max(0.5, +qs.get('fade') || 7), // Überblendung in Sekunden
    titel: qs.get('titel') !== '0',
    start: qs.get('szene'),
    nur: qs.get('nur') ? qs.get('nur').split(',') : null, // z. B. ?nur=aurora,koi
  };

  // Sparmodus: Adresse > gespeicherte Wahl > automatisch
  let sparChoice = qs.has('spar') ? (qs.get('spar') === '0' ? 'aus' : 'an') : store.get('spar');
  let spar = sparChoice === 'an';

  const scenes = cfg.nur ? DK.scenes.filter((d) => cfg.nur.includes(d.id)) : DK.scenes;

  // Stimmungen: begrenzen, aus welchen Szenen gewürfelt wird
  const genres = DK.GENRES || [{ id: 'alle', name: 'Alles', scenes: null }];
  const genreOf = (id) => genres.find((g) => g.id === id) || genres[0];
  let genre = genreOf(qs.get('stimmung') || store.get('stimmung') || 'alle');
  function pool(g = genre) {
    const avail = scenes.filter((d) => !d.broken);
    if (!g.scenes) return avail;
    const list = avail.filter((d) => g.scenes.includes(d.id));
    return list.length ? list : avail;
  }

  // Gemeinsamer Zustand, den alle Szenen lesen
  const env = {
    hue: Math.random(),
    q: spar ? 0.5 : 1, // Qualitätsstufe: Szenen skalieren damit ihre Teilchenzahlen
    audio: { level: 0, bass: 0, mid: 0, high: 0 },
    audioVec: [0, 0, 0, 0],
    pointer: { nx: 0.5, ny: 0.5, active: 0, pulse: false, down: false },
    winW: innerWidth,
    winH: innerHeight,
  };

  const state = {
    cur: null, prev: null, fadeT: 0, pending: null,
    paused: false, locked: false, dim: 0, showFps: false,
    history: [], bag: [],
  };

  // ---------- Szenen-Slots ----------
  function size(slot) {
    const w = Math.max(2, Math.round(innerWidth * slot.scale));
    const h = Math.max(2, Math.round(innerHeight * slot.scale));
    slot.canvas.width = w;
    slot.canvas.height = h;
    slot.env.w = w;
    slot.env.h = h;
  }

  function makeSlot(def) {
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    const slot = {
      def, canvas, scale: (def.scale || 1) * (spar ? 0.6 : 1), t: 0, age: 0, strikes: 0,
      duration: cfg.dauer * DK.rand(0.75, 1.25),
      env: Object.create(env),
    };
    try {
      if (def.type === 'webgl2') {
        const gl = canvas.getContext('webgl2', {
          alpha: false, antialias: false, depth: false, stencil: false,
          premultipliedAlpha: false, powerPreference: 'high-performance',
        });
        if (!gl) throw new Error('WebGL2 nicht verfügbar');
        if (def.needsFloat && !gl.getExtension('EXT_color_buffer_float')) throw new Error('Keine Float-Rendertargets');
        slot.ctx = gl;
      } else {
        slot.ctx = canvas.getContext('2d', { alpha: false });
      }
      size(slot);
      slot.inst = def.create(slot.ctx, slot.env);
    } catch (e) {
      console.warn(`Szene „${def.name}“ übersprungen:`, e);
      def.broken = true;
      destroySlot(slot);
      return null;
    }
    return slot;
  }

  function destroySlot(slot) {
    try { slot.inst && slot.inst.destroy && slot.inst.destroy(); } catch (e) { /* egal */ }
    if (slot.ctx && slot.def.type === 'webgl2') {
      const ext = slot.ctx.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    slot.canvas.remove();
  }

  function nextDef() {
    const avail = pool();
    if (!avail.length) return null;
    if (!state.bag.length) {
      state.bag = DK.shuffle(avail.slice());
      if (state.cur && state.bag[0] === state.cur.def && state.bag.length > 1) state.bag.push(state.bag.shift());
    }
    const d = state.bag.shift();
    return d.broken ? nextDef() : d;
  }

  function go(def, opts = {}) {
    if (!def) { toast('Keine Szene lauffähig – WebGL2 aktiviert?'); return; }
    if (state.cur && !opts.back && !state.pending) {
      state.history.push(state.cur.def);
      if (state.history.length > 50) state.history.shift();
    }
    // Sparmodus: erst ausblenden, dann die neue Szene erzeugen – nie zwei gleichzeitig
    if (spar && state.cur && !opts.instant) {
      if (state.prev) { destroySlot(state.prev); state.prev = null; }
      if (!state.pending) state.fadeT = 0;
      state.pending = def;
      return;
    }
    start(def, opts.instant);
  }

  function start(def, instant) {
    if (!def) { toast('Keine Szene lauffähig – WebGL2 aktiviert?'); return; }
    if (state.prev) { destroySlot(state.prev); state.prev = null; }
    const slot = makeSlot(def);
    if (!slot) return start(nextDef(), instant);
    if (spar || instant) {
      if (state.cur) destroySlot(state.cur);
      state.prev = null;
      slot.fadeIn = instant ? undefined : 0;
    } else {
      state.prev = state.cur;
    }
    state.cur = slot;
    state.fadeT = 0;
    slot.canvas.style.opacity = state.prev || slot.fadeIn !== undefined ? 0 : 1;
    showTitle(slot);
    if (!$('#help').hidden) buildHelp();
  }

  function setSpar(on, why) {
    spar = on;
    env.q = on ? 0.5 : 1;
    toast(on ? `Sparmodus an${why ? ' – ' + why : ''} (Q schaltet um)` : 'Sparmodus aus – volle Qualität');
    if (state.cur) go(state.cur.def, { instant: true });
    if (!$('#help').hidden) buildHelp();
  }

  // ---------- Hauptschleife ----------
  let last = performance.now();
  let fpsEma = 60, slowFor = 0, verySlowFor = 0, fpsShown = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    // Sparmodus: höchstens ~30 Bilder pro Sekunde
    if (spar && now - last < 1000 / 31) return;
    const dt = Math.min(0.1, Math.max(0.0001, (now - last) / 1000));
    last = now;
    if (state.paused || !state.cur) return;

    env.hue = (env.hue + dt * 0.0035) % 1;
    updateAudio(dt);
    const p = env.pointer;
    p.active = Math.max(0, p.active - dt * 0.35);

    const half = cfg.fade / 2;
    if (state.pending) {
      state.fadeT += dt;
      const k = DK.smooth(Math.min(1, state.fadeT / half));
      state.cur.canvas.style.opacity = (1 - k).toFixed(3);
      if (k >= 1) { const d = state.pending; state.pending = null; start(d); }
    } else if (state.cur.fadeIn !== undefined) {
      state.cur.fadeIn += dt;
      const k = DK.smooth(Math.min(1, state.cur.fadeIn / half));
      state.cur.canvas.style.opacity = k.toFixed(3);
      if (k >= 1) state.cur.fadeIn = undefined;
    } else if (state.prev) {
      state.fadeT += dt;
      const k = DK.smooth(Math.min(1, state.fadeT / cfg.fade));
      state.cur.canvas.style.opacity = k.toFixed(3);
      if (k >= 1) { destroySlot(state.prev); state.prev = null; }
    }

    for (const s of [state.prev, state.cur]) {
      if (!s) continue;
      s.t += dt;
      s.age += dt;
      try {
        s.inst.render(s.t, dt, s.env);
      } catch (e) {
        console.error(`Fehler in „${s.def.name}“:`, e);
        s.def.broken = true;
        if (s === state.cur) { state.pending = null; start(nextDef(), true); return; }
        destroySlot(s); state.prev = null;
      }
    }
    p.pulse = false;

    if (!state.locked && !state.pending && state.cur.age > state.cur.duration) go(nextDef());

    // Leistung beobachten: erst Auflösung senken, bei Dauerruckeln Sparmodus vorschlagen
    fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
    const cur = state.cur;
    const target = spar ? 24 : 42;
    const steady = !state.prev && !state.pending && cur.fadeIn === undefined && cur.age > 3;
    if (steady && cur.def.adaptive !== false && fpsEma < target && cur.scale > 0.3) {
      slowFor += dt;
      if (slowFor > 2.5) {
        slowFor = 0;
        cur.strikes++;
        cur.scale *= 0.85;
        size(cur);
        if (cur.inst.resize) cur.inst.resize(cur.env.w, cur.env.h);
        fpsEma = target + 8;
      }
    } else slowFor = 0;
    if (steady && !spar && sparChoice !== 'aus' && (fpsEma < 22 || cur.strikes >= 4)) {
      verySlowFor += dt;
      if (verySlowFor > 4) { verySlowFor = 0; store.set('spar', 'an'); sparChoice = 'an'; setSpar(true, 'das Gerät kommt nicht mit'); }
    } else verySlowFor = 0;

    if (state.showFps && now - fpsShown > 400) {
      fpsShown = now;
      $('#fps').textContent = `${fpsEma.toFixed(0)} fps · ${cur.env.w}×${cur.env.h} · ${cur.def.name}${spar ? ' · Sparmodus' : ''} · ${Math.max(0, cur.duration - cur.age).toFixed(0)} s`;
    }
  }

  // ---------- Titel, Hinweise ----------
  let titleTimer = 0;
  function showTitle(slot) {
    if (!cfg.titel) return;
    const el = $('#titel');
    el.querySelector('.name').textContent = slot.def.name;
    el.querySelector('.sub').textContent = slot.inst.info || slot.def.sub || '';
    el.classList.add('show');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => el.classList.remove('show'), 8000);
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function buildHelp() {
    const list = $('#help .szenen');
    list.innerHTML = '';
    scenes.forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = (i < 10 ? ((i + 1) % 10) + '  ' : '   ') + d.name + (d.broken ? ' (nicht unterstützt)' : '');
      b.disabled = !!d.broken;
      if (state.cur && state.cur.def === d) b.classList.add('aktiv');
      b.onclick = () => go(d);
      list.appendChild(b);
    });
    $('#help .modus').textContent = `Stimmung: ${genre.name}${spar ? ' · Sparmodus' : ''}`;
  }

  // ---------- Startbildschirm: Stimmung wählen ----------
  let countdown = 0, countdownTimer = 0;
  function buildStart() {
    const box = $('#start .karten');
    box.innerHTML = '';
    for (const g of genres) {
      const b = document.createElement('button');
      b.className = 'karte' + (g === genre ? ' zuletzt' : '');
      b.style.setProperty('--a', g.a || '#888');
      b.style.setProperty('--b', g.b || '#ccc');
      const n = pool(g).length;
      b.innerHTML = `<span class="glyph"></span><span class="name"></span><span class="desc"></span><span class="anzahl"></span>`;
      b.querySelector('.glyph').textContent = g.glyph || '✦';
      b.querySelector('.name').textContent = g.name;
      b.querySelector('.desc').textContent = g.desc || '';
      b.querySelector('.anzahl').textContent = `${n} ${n === 1 ? 'Szene' : 'Szenen'}`;
      b.onclick = () => selectGenre(g.id);
      box.appendChild(b);
    }
  }
  function openStart(withCountdown) {
    buildStart();
    toggleHelp(false);
    const el = $('#start');
    el.hidden = false;
    requestAnimationFrame(() => el.classList.remove('weg'));
    stopCountdown();
    if (withCountdown) {
      countdown = 25;
      tickCountdown();
      countdownTimer = setInterval(tickCountdown, 1000);
    } else {
      $('#start .auto').textContent = 'Esc behält die aktuelle Stimmung';
    }
    const cur = $('#start .karte.zuletzt') || $('#start .karte');
    if (cur) cur.focus({ preventScroll: true });
  }
  function tickCountdown() {
    $('#start .auto').textContent = `Ohne Auswahl geht es in ${countdown} s weiter mit: ${genre.name}`;
    if (countdown-- <= 0) selectGenre(genre.id);
  }
  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = 0;
  }
  function closeStart() {
    stopCountdown();
    const el = $('#start');
    el.classList.add('weg');
    setTimeout(() => { if (el.classList.contains('weg')) el.hidden = true; }, 1200);
  }
  function selectGenre(id) {
    genre = genreOf(id);
    store.set('stimmung', genre.id);
    state.bag = [];
    closeStart();
    toast(`Stimmung: ${genre.name}${genre.id === 'party' ? ' – Tipp: M fürs Mikrofon' : ''}`);
    // passt die laufende Szene schon, darf sie weiterlaufen – sonst weich überblenden
    if (!state.cur || !pool().includes(state.cur.def)) go(nextDef());
  }
  function startKey(e) {
    const k = e.key.toLowerCase();
    if (countdownTimer) { stopCountdown(); $('#start .auto').textContent = 'Wähle eine Stimmung'; }
    const cards = [...document.querySelectorAll('#start .karte')];
    const i = cards.indexOf(document.activeElement);
    if (k === 'arrowright' || k === 'arrowdown') { cards[(i + 1) % cards.length].focus(); e.preventDefault(); }
    else if (k === 'arrowleft' || k === 'arrowup') { cards[(i - 1 + cards.length) % cards.length].focus(); e.preventDefault(); }
    else if (k === 'escape') selectGenre(genre.id);
    else if (k === 'f') toggleFullscreen();
  }

  function toggleHelp(force) {
    const h = $('#help');
    h.hidden = force !== undefined ? !force : !h.hidden;
    if (!h.hidden) buildHelp();
  }

  // ---------- Mikrofon ----------
  let audio = null;
  async function toggleMic() {
    if (audio) {
      audio.stream.getTracks().forEach((t) => t.stop());
      audio.ac.close();
      audio = null;
      toast('Mikrofon aus');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.75;
      ac.createMediaStreamSource(stream).connect(an);
      audio = { ac, an, stream, data: new Uint8Array(an.frequencyBinCount), peak: [0.1, 0.1, 0.1] };
      toast('Mikrofon an – die Decke hört zu');
    } catch (e) {
      toast('Kein Zugriff aufs Mikrofon');
    }
  }

  function band(data, a, b) {
    let s = 0;
    for (let i = a; i < b; i++) s += data[i];
    return s / ((b - a) * 255);
  }

  function updateAudio(dt) {
    const A = env.audio;
    if (!audio) {
      A.level *= 0.95; A.bass *= 0.95; A.mid *= 0.95; A.high *= 0.95;
    } else {
      audio.an.getByteFrequencyData(audio.data);
      const hz = audio.ac.sampleRate / audio.an.fftSize;
      const raw = [
        band(audio.data, 1, Math.max(2, Math.round(250 / hz))),
        band(audio.data, Math.round(250 / hz), Math.round(2000 / hz)),
        band(audio.data, Math.round(2000 / hz), Math.round(8000 / hz)),
      ];
      const keys = ['bass', 'mid', 'high'];
      for (let i = 0; i < 3; i++) {
        // automatische Verstärkung: relativ zum gleitenden Spitzenwert
        audio.peak[i] = Math.max(audio.peak[i] * Math.pow(0.5, dt / 8), raw[i], 0.02);
        const v = DK.clamp(raw[i] / audio.peak[i], 0, 1);
        const k = v > A[keys[i]] ? 0.5 : 0.08;
        A[keys[i]] += (v - A[keys[i]]) * k;
      }
      A.level = (A.bass + A.mid + A.high) / 3;
    }
    env.audioVec[0] = A.level; env.audioVec[1] = A.bass; env.audioVec[2] = A.mid; env.audioVec[3] = A.high;
  }

  // ---------- Bildschirm wachhalten ----------
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* nicht erlaubt – egal */ }
  }
  document.addEventListener('visibilitychange', keepAwake);

  // ---------- Eingaben ----------
  function setDim(d) {
    state.dim = DK.clamp(d, 0, 0.9);
    $('#dim').style.opacity = state.dim;
    toast(`Helligkeit ${Math.round((1 - state.dim) * 100)} %`);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  }

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    keepAwake();
    if (!$('#start').hidden && !$('#start').classList.contains('weg')) { startKey(e); return; }
    const k = e.key.toLowerCase();
    if (k >= '0' && k <= '9') {
      const d = scenes[(+k + 9) % 10];
      if (d && !d.broken) go(d);
      return;
    }
    switch (k) {
      case ' ': case 'arrowright': go(nextDef()); break;
      case 'arrowleft': { const d = state.history.pop(); if (d) go(d, { back: true }); break; }
      case 'r': go(state.cur.def, { instant: true }); toast('Neu gewürfelt'); break;
      case 'q':
        sparChoice = spar ? 'aus' : 'an';
        store.set('spar', sparChoice);
        setSpar(!spar);
        break;
      case 'f': toggleFullscreen(); break;
      case 'p':
        state.paused = !state.paused;
        toast(state.paused ? 'Pause' : 'Weiter');
        break;
      case 'l':
        state.locked = !state.locked;
        if (!state.locked) state.cur.age = 0;
        toast(state.locked ? 'Szene festgehalten' : 'Automatischer Wechsel');
        break;
      case 'm': toggleMic(); break;
      case '+': case '=': case 'arrowup': setDim(state.dim - 0.1); break;
      case '-': case 'arrowdown': setDim(state.dim + 0.1); break;
      case 't':
        cfg.titel = !cfg.titel;
        toast(cfg.titel ? 'Titel an' : 'Titel aus');
        if (!cfg.titel) $('#titel').classList.remove('show');
        break;
      case 'i':
        state.showFps = !state.showFps;
        $('#fps').hidden = !state.showFps;
        break;
      case 'g': openStart(false); break;
      case 'h': case '?': toggleHelp(); break;
      case 'escape': toggleHelp(false); break;
      default: return;
    }
    e.preventDefault();
  });

  let idleTimer = 0;
  function poke(e) {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500);
    if (e && e.target && e.target.closest && e.target.closest('#help, #start')) return false;
    if (e && e.clientX !== undefined) {
      env.pointer.nx = e.clientX / innerWidth;
      env.pointer.ny = e.clientY / innerHeight;
    }
    return true;
  }
  addEventListener('pointermove', (e) => { if (poke(e)) env.pointer.active = 1; });
  addEventListener('pointerdown', (e) => {
    keepAwake();
    if (!poke(e)) return;
    env.pointer.active = 1;
    env.pointer.pulse = true;
    env.pointer.down = true;
  });
  addEventListener('pointerup', () => { env.pointer.down = false; });
  addEventListener('dblclick', (e) => { if (!e.target.closest('#help, #start')) toggleFullscreen(); });
  $('#start').addEventListener('pointermove', () => {
    if (countdownTimer) { stopCountdown(); $('#start .auto').textContent = 'Wähle eine Stimmung'; }
  });
  $('#help .zu').onclick = () => toggleHelp(false);

  addEventListener('resize', () => {
    env.winW = innerWidth;
    env.winH = innerHeight;
    for (const s of [state.prev, state.cur]) {
      if (!s) continue;
      size(s);
      if (s.inst.resize) s.inst.resize(s.env.w, s.env.h);
    }
  });

  // ---------- Start ----------
  const startDef = cfg.start && scenes.find((d) => d.id === cfg.start);
  if (startDef || qs.has('stimmung') || qs.get('auswahl') === '0') {
    start(startDef || nextDef());
  } else {
    // hinter der Auswahl läuft schon eine ruhige Szene
    start(DK.pick(pool(genreOf('ruhig'))));
    openStart(true);
  }
  requestAnimationFrame(frame);
  keepAwake();
  poke();
  if (spar) setTimeout(() => toast('Sparmodus ist an (Q schaltet um)'), 1500);
  setTimeout(() => $('#hint').classList.add('weg'), 9000);

  DK.director = { go, env, state, scenes, setSpar, selectGenre, openStart, pool };
})();
