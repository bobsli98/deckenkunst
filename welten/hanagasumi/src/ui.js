// HUD, start overlay, keyboard / mouse / touch controls.
import { clamp } from './noise.js';

const CSS = `
#ui{position:fixed;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;z-index:5}
#ui .hud{position:absolute;left:22px;top:18px;text-shadow:0 1px 8px rgba(0,0,0,.55);transition:opacity 1.5s;opacity:0}
#ui.on .hud{opacity:1}
#ui .hud .t{font-size:15px;letter-spacing:.32em;opacity:.92}
#ui .hud .s{font-size:12.5px;letter-spacing:.14em;opacity:.8;margin-top:5px;font-family:system-ui,sans-serif}
#ui .hint{position:absolute;left:0;right:0;bottom:22px;text-align:center;font:12.5px system-ui,sans-serif;letter-spacing:.08em;opacity:.78;text-shadow:0 1px 8px rgba(0,0,0,.7);transition:opacity 1.2s}
#ui .start{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;
  background:radial-gradient(ellipse at center,rgba(8,10,16,.12) 0%,rgba(8,10,16,.5) 100%);transition:opacity 1.4s}
#ui .start h1{font-weight:400;font-size:clamp(54px,10vw,128px);margin:0;letter-spacing:.18em;text-shadow:0 4px 40px rgba(0,0,0,.5)}
#ui .start h2{font-weight:400;font-size:clamp(13px,1.6vw,19px);margin:.4em 0 2.6em;letter-spacing:.62em;opacity:.9;text-indent:.62em}
#ui .start .go{font:14px system-ui,sans-serif;letter-spacing:.3em;padding:13px 30px;border:1px solid rgba(255,255,255,.55);border-radius:2px;backdrop-filter:blur(6px);background:rgba(20,22,30,.25)}
#ui .start .load{font:12px system-ui,sans-serif;letter-spacing:.18em;opacity:.7;margin-top:18px;height:1.2em}
#ui .start .keys{font:12px system-ui,sans-serif;letter-spacing:.06em;opacity:.9;text-shadow:0 1px 6px rgba(0,0,0,.9),0 0 14px rgba(0,0,0,.6);margin-top:34px;line-height:1.9;text-align:center;max-width:92vw}
#ui .help{position:absolute;right:22px;top:18px;font:12.5px/1.85 system-ui,sans-serif;background:rgba(12,14,20,.55);backdrop-filter:blur(8px);padding:14px 18px;border-radius:4px;display:none;letter-spacing:.03em}
#ui .help b{display:inline-block;min-width:92px;font-weight:600;opacity:.95}
#ui .touch{position:absolute;inset:0;display:none}
#ui .touch .btns{position:absolute;right:14px;bottom:18px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
#ui .touch .btn{width:54px;height:54px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(15,18,26,.35);display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif;color:#fff}
#ui .touch .stick{position:absolute;left:26px;bottom:26px;width:120px;height:120px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(15,18,26,.2)}
#ui .touch .knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.4)}
#ui.hide .hud,#ui.hide .hint,#ui.hide .help,#ui.hide .touch{opacity:0!important}
`;

export function setupUI(ctx, api) {
  const root = document.getElementById('ui');
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const touchDevice = 'ontouchstart' in window && navigator.maxTouchPoints > 0;
  root.innerHTML = `
    <div class="hud"><div class="t">花霞 HANAGASUMI</div><div class="s" id="hudS"></div></div>
    <div class="hint" id="hint"></div>
    <div class="help" id="help">
      <div><b>W A S D</b>bewegen</div><div><b>Maus</b>umsehen</div><div><b>Shift</b>schneller</div>
      <div><b>Leertaste / C</b>steigen / sinken · springen</div><div><b>Mausrad</b>Fluggeschwindigkeit</div>
      <div><b>F</b>Gehen ↔ Fliegen</div><div><b>G</b>Kamerafahrt (automatisch)</div>
      <div><b>1 2 3 4</b>Morgen · Mittag · Abend · Nacht</div><div><b>Q / E</b>Zeit zurück / vor</div><div><b>P</b>Zeit anhalten</div>
      <div><b>J</b>nächste Jahreszeit</div><div><b>R</b>neue Welt erzeugen</div><div><b>K</b>Grafikqualität</div><div><b>M</b>Ton an / aus</div><div><b>N</b>Musik an / aus</div><div><b>U</b>Anzeige ausblenden</div><div><b>H</b>diese Hilfe</div>
    </div>
    <div class="touch" id="touch"><div class="stick" id="stick"><div class="knob" id="knob"></div></div>
      <div class="btns"><div class="btn" data-a="world">新</div><div class="btn" data-a="season">季</div><div class="btn" data-a="time">☼</div><div class="btn" data-a="up">▲</div><div class="btn" data-a="down">▼</div><div class="btn" data-a="mode">⇅</div></div></div>
    <div class="start" id="start"><h1>花霞</h1><h2>HANAGASUMI</h2><div class="go" id="go">ERKUNDEN</div><div class="load" id="load"></div>
      <div class="keys">${touchDevice ? 'Links bewegen · rechts umsehen · Tasten rechts: Modus, Höhe, Tageszeit, Jahreszeit, neue Welt' : 'W A S D bewegen · Maus umsehen · F Gehen / Fliegen · 1–4 Tageszeit · J Jahreszeit · R neue Welt · H Hilfe'}</div></div>`;
  const $ = (id) => document.getElementById(id);
  const hudS = $('hudS'), hint = $('hint'), help = $('help'), start = $('start'), canvas = ctx.renderer.domElement;
  if (api.noUI) { root.style.display = 'none'; }
  let started = false, hintT = 0;
  const say = (t, sec = 4) => { hint.textContent = t; hint.style.opacity = 0.85; hintT = sec; };
  const modeName = { fly: 'Fliegen', walk: 'Zu Fuss', cine: 'Kamerafahrt' };

  function begin() {
    if (!started) {
      started = true; root.classList.add('on'); start.style.opacity = 0; setTimeout(() => { start.style.display = 'none'; }, 1400);
      api.setMode('fly');
      say(touchDevice ? 'Links bewegen · rechts umsehen' : 'W A S D + Maus · F zum Gehen · H für alle Tasten', 9);
      if (touchDevice) $('touch').style.display = 'block';
    }
    api.audioStart();
    if (!touchDevice && document.pointerLockElement !== canvas && !lockFailed) {
      try { const pr = canvas.requestPointerLock && canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => { lockFailed = true; }); } catch (e) { lockFailed = true; }
      setTimeout(() => { if (document.pointerLockElement !== canvas) { lockFailed = lockTries++ > 0 || lockFailed; say('Maustaste halten und ziehen zum Umsehen · W A S D bewegen', 8); } }, 500);
    }
  }
  let lockFailed = false, lockTries = 0, dragging = false;
  canvas.addEventListener('mousedown', () => { dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });
  start.addEventListener('click', begin);
  canvas.addEventListener('click', () => { if (started) begin(); });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas && !(dragging && started)) return;
    ctx.input.lookX += clamp(e.movementX, -200, 200) * 0.0021; ctx.input.lookY += clamp(e.movementY, -200, 200) * 0.0021;
  });
  document.addEventListener('pointerlockchange', () => { if (started && document.pointerLockElement !== canvas && !touchDevice) say('Klicken für Maussteuerung · oder Maustaste halten und ziehen', 12); else if (started) hintT = Math.min(hintT, 0.5); });
  window.addEventListener('wheel', (e) => { ctx.player.flySpeed = clamp(ctx.player.flySpeed * (e.deltaY < 0 ? 1.15 : 0.87), 4, 220); say('Fluggeschwindigkeit ' + Math.round(ctx.player.flySpeed * 3.6) + ' km/h', 1.5); }, { passive: true });

  const act = {
    mode() { const m = ctx.player.mode === 'walk' ? 'fly' : 'walk'; api.setMode(m); say(modeName[m]); },
    cine() { api.setMode(ctx.player.mode === 'cine' ? 'fly' : 'cine'); say(modeName[ctx.player.mode]); },
    season() { api.nextSeason(); },
    world() { api.newWorld(); },
    time() { api.cycleTime(); },
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
    ctx.keys.add(e.code);
    if (!started) { if (e.code === 'Enter' || e.code === 'Space') begin(); return; }
    switch (e.code) {
      case 'KeyF': act.mode(); break;
      case 'KeyG': act.cine(); break;
      case 'Digit1': api.setTime('morning'); say('Morgen'); break;
      case 'Digit2': api.setTime('noon'); say('Mittag'); break;
      case 'Digit3': api.setTime('evening'); say('Abend'); break;
      case 'Digit4': api.setTime('night'); say('Nacht'); break;
      case 'KeyP': say(api.togglePause() ? 'Zeit angehalten' : 'Zeit läuft'); break;
      case 'KeyJ': act.season(); break;
      case 'KeyR': api.newWorld(); break;
      case 'KeyK': say('Qualität: ' + api.cycleQuality()); break;
      case 'KeyM': say(api.toggleMute() ? 'Ton aus' : 'Ton an'); break;
      case 'KeyN': say(api.toggleMusic() ? 'Musik an' : 'Musik aus'); break;
      case 'KeyH': help.style.display = help.style.display === 'block' ? 'none' : 'block'; break;
      case 'KeyU': root.classList.toggle('hide'); break;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => ctx.keys.delete(e.code));
  window.addEventListener('blur', () => ctx.keys.clear());

  // touch: left stick moves, right side looks
  if (touchDevice) {
    const stick = $('stick'), knob = $('knob');
    let moveId = null, lookId = null, lx = 0, ly = 0, cx = 0, cy = 0;
    const onStart = (e) => {
      if (!started) return;
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.btn')) continue;
        if (t.clientX < window.innerWidth * 0.4 && moveId === null) { moveId = t.identifier; const r = stick.getBoundingClientRect(); cx = r.left + 60; cy = r.top + 60; }
        else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = (t.clientX - cx) / 50, dy = (t.clientY - cy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          ctx.input.moveX = dx; ctx.input.moveZ = -dy; knob.style.transform = `translate(${dx * 35}px,${dy * 35}px)`;
        } else if (t.identifier === lookId) { ctx.input.lookX += (t.clientX - lx) * 0.005; ctx.input.lookY += (t.clientY - ly) * 0.005; lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    };
    const onEnd = (e) => { for (const t of e.changedTouches) { if (t.identifier === moveId) { moveId = null; ctx.input.moveX = ctx.input.moveZ = 0; knob.style.transform = ''; } if (t.identifier === lookId) lookId = null; } };
    canvas.addEventListener('touchstart', onStart, { passive: true }); $('touch').addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onEnd); window.addEventListener('touchcancel', onEnd);
    $('touch').style.pointerEvents = 'none'; stick.style.pointerEvents = 'auto';
    for (const b of root.querySelectorAll('.btn')) {
      const a = b.dataset.a;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (a === 'up') ctx.input.up = 1; else if (a === 'down') ctx.input.up = -1; else act[a](); }, { passive: false });
      b.addEventListener('touchend', () => { if (a === 'up' || a === 'down') ctx.input.up = 0; });
    }
  }

  return {
    say,
    update(dt, info) {
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.style.opacity = 0; }
      const h = Math.floor(info.time), m = Math.floor((info.time - h) * 60);
      const txt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${info.season} · ${modeName[ctx.player.mode]} · Welt ${info.seed}`;
      if (hudS.textContent !== txt) hudS.textContent = txt;
      if (!started) { const l = $('load'); const t = info.loading ? 'Die Landschaft wächst …' : ''; if (l.textContent !== t) l.textContent = t; }
    },
  };
}
