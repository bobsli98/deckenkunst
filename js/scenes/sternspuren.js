/* Sternspuren: Langzeitbelichtung des Nachthimmels – die Sterne kreisen um den Himmelspol, Sternschnuppen fallen */
(function () {
  'use strict';
  const TAU = DK.TAU;

  DK.register({
    id: 'sternspuren',
    name: 'Sternspuren',
    sub: 'Eine Nacht, auf Minuten belichtet',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const N = Math.round(550 * env.q + 250);
      const omega = DK.rand(0.035, 0.06) * (Math.random() < 0.5 ? -1 : 1);
      const maxArc = DK.rand(0.9, 2.2);
      const pole = { x: DK.rand(0.2, 0.8), y: DK.rand(0.2, 0.8) };
      // nur Sterne erzeugen, deren Bahn das Bild auch schneidet (in Einheiten von max(w, h))
      const Mx = Math.max(env.w, env.h);
      const reach = Math.max(
        Math.hypot(pole.x * env.w, pole.y * env.h), Math.hypot((1 - pole.x) * env.w, pole.y * env.h),
        Math.hypot(pole.x * env.w, (1 - pole.y) * env.h), Math.hypot((1 - pole.x) * env.w, (1 - pole.y) * env.h)) / Mx;
      const tint = DK.pick(['Klar', 'Polarnacht', 'Wüste']);
      // Sterne nach Farbe (4) und Helligkeit (6) gruppiert: ein Zeichenaufruf pro Gruppe
      const COLS = [[255, 190, 140], [255, 235, 200], [215, 228, 255], [170, 195, 255]];
      const LEVELS = 6;
      const groups = [];
      for (let c = 0; c < COLS.length; c++) {
        for (let l = 0; l < LEVELS; l++) {
          const b = 0.08 + 0.9 * Math.pow((l + 0.5) / LEVELS, 3);
          groups.push({ lw: Math.max(0.8, b * 2.4), css: `rgba(${COLS[c][0]},${COLS[c][1]},${COLS[c][2]},${(b * 0.6).toFixed(3)})`, stars: [] });
        }
      }
      for (let i = 0; i < N; i++) {
        const temp = Math.random();
        const c = temp < 0.15 ? 0 : temp < 0.35 ? 1 : temp < 0.8 ? 2 : 3;
        const l = Math.min(LEVELS - 1, Math.floor(Math.random() * LEVELS));
        groups[c * LEVELS + l].stars.push({ r: Math.pow(Math.random(), 0.7) * reach, a: Math.random() * TAU });
      }
      const meteors = [];
      let nextMeteor = DK.rand(3, 8);
      let bg = null, film = null, fctx = null, lastRot = null, fadeT = 0;

      function buildBg() {
        bg = document.createElement('canvas');
        bg.width = env.w; bg.height = env.h;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(env.w / 2, env.h / 2, 0, env.w / 2, env.h / 2, Math.max(env.w, env.h) * 0.75);
        if (tint === 'Polarnacht') { grd.addColorStop(0, 'hsl(170, 40%, 6%)'); grd.addColorStop(1, 'hsl(220, 50%, 2%)'); }
        else if (tint === 'Wüste') { grd.addColorStop(0, 'hsl(25, 35%, 5%)'); grd.addColorStop(1, 'hsl(240, 40%, 2%)'); }
        else { grd.addColorStop(0, 'hsl(225, 45%, 6%)'); grd.addColorStop(1, 'hsl(235, 50%, 1.5%)'); }
        g.fillStyle = grd;
        g.fillRect(0, 0, env.w, env.h);
        // „Film“: darauf sammeln sich die Spuren wie bei einer Langzeitbelichtung
        film = document.createElement('canvas');
        film.width = env.w; film.height = env.h;
        fctx = film.getContext('2d');
        fctx.lineCap = 'butt';
        lastRot = null;
      }
      buildBg();

      return {
        info: `Himmel: ${tint}`,
        resize() { buildBg(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.max(w, h);
          const px = pole.x * w, py = pole.y * h;
          const rot = t * omega;

          // nur das neue Stück jeder Spur belichten – billig, egal wie lang die Spuren werden.
          // Die Sterne ziehen so langsam, dass 20 Belichtungen pro Sekunde reichen.
          if (lastRot === null) lastRot = rot;
          if (Math.abs(rot - lastRot) * M > 2.5 || Math.abs(rot - lastRot) > 0.004) {
            fctx.globalCompositeOperation = 'lighter';
            const r0 = Math.min(lastRot, rot), r1 = Math.max(lastRot, rot);
            for (const g of groups) {
              if (!g.stars.length) continue;
              fctx.lineWidth = g.lw;
              fctx.strokeStyle = g.css;
              fctx.beginPath();
              for (const s of g.stars) {
                const R = s.r * M;
                fctx.moveTo(px + Math.cos(s.a + r0) * R, py + Math.sin(s.a + r0) * R);
                fctx.arc(px, py, R, s.a + r0, s.a + r1);
              }
              fctx.stroke();
            }
            lastRot = rot;
          }
          // alle paar Sekunden verblasst die ältere Belichtung um einen Schritt
          fadeT += dt;
          if (fadeT > 60 / (maxArc * 60 * Math.abs(omega)) && t > 8) {
            fadeT = 0;
            fctx.globalCompositeOperation = 'destination-out';
            fctx.fillStyle = 'rgba(0,0,0,0.14)';
            fctx.fillRect(0, 0, w, h);
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(film, 0, 0);
          ctx.lineCap = 'round';

          // Sternschnuppen
          nextMeteor -= dt * (1 + env.audio.high * 3);
          if (nextMeteor < 0 || env.pointer.pulse) {
            nextMeteor = DK.rand(3, 10);
            const a = Math.random() * TAU;
            const sx = env.pointer.pulse ? env.pointer.nx * w : Math.random() * w;
            const sy = env.pointer.pulse ? env.pointer.ny * h : Math.random() * h;
            meteors.push({ x: sx, y: sy, vx: Math.cos(a) * M * 0.9, vy: Math.sin(a) * M * 0.9, age: 0, life: DK.rand(0.5, 1.1), hue: DK.rand(0.3, 0.6) });
          }
          for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            m.age += dt;
            if (m.age > m.life) { meteors.splice(i, 1); continue; }
            m.x += m.vx * dt; m.y += m.vy * dt;
            const k = Math.sin((Math.PI * m.age) / m.life);
            const tl = 0.12;
            const grd = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tl, m.y - m.vy * tl);
            grd.addColorStop(0, `rgba(255,255,255,${k})`);
            grd.addColorStop(0.3, DK.hsl(m.hue, 0.6, 0.7, k * 0.5));
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.strokeStyle = grd;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - m.vx * tl, m.y - m.vy * tl);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
