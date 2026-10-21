/* Leuchtender Strand: nachts brechen Wellen, und das Plankton darin leuchtet auf – Blick von oben */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const GLOWS = [
    { n: 'Blaues Plankton', h: 0.52 },
    { n: 'Grünes Meeresleuchten', h: 0.43 },
    { n: 'Violette Nacht', h: 0.7 },
  ];

  DK.register({
    id: 'biolumineszenz',
    name: 'Leuchtender Strand',
    sub: 'Wellen voller lebendem Licht',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const G = DK.pick(GLOWS);
      const ang = Math.random() * TAU;
      const shore = DK.rand(0.6, 0.74); // Wasserlinie quer zum Strand (0 = offenes Meer, 1 = Land)
      const waves = [], sparks = [];
      const maxSparks = Math.round(1300 * env.q + 300);
      const NP = 44;
      let W, H, L, bg, nextWave = 0;

      // u quer zum Ufer, v entlang des Ufers
      function toXY(u, v) {
        const c = Math.cos(ang), s = Math.sin(ang);
        const x = (u - 0.5) * L, y = (v - 0.5) * L;
        return [W / 2 + x * c - y * s, H / 2 + x * s + y * c];
      }

      function build() {
        W = env.w; H = env.h; L = Math.hypot(W, H);
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const [x0, y0] = toXY(0, 0.5), [x1, y1] = toXY(1, 0.5);
        const grd = g.createLinearGradient(x0, y0, x1, y1);
        grd.addColorStop(0, 'hsl(222, 60%, 3%)');
        grd.addColorStop(Math.max(0, shore - 0.12), 'hsl(212, 55%, 6%)');
        grd.addColorStop(shore, 'hsl(205, 30%, 8%)');
        grd.addColorStop(Math.min(1, shore + 0.03), 'hsl(32, 14%, 8%)');
        grd.addColorStop(1, 'hsl(36, 18%, 12%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        // Sandkörner und Sternenspiegelung
        for (let i = 0; i < (W * H) / 1800; i++) {
          g.fillStyle = `rgba(${Math.random() < 0.5 ? '210,200,180' : '160,190,230'},${DK.rand(0.02, 0.08)})`;
          g.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
        }
      }
      build();

      function spawnWave() {
        waves.push({ u: -0.04, sp: DK.rand(0.035, 0.06), ph: Math.random() * 100, run: shore + DK.rand(0.02, 0.07), b: 0, back: false, a: 1 });
      }
      for (let k = 0; k < 4; k++) { spawnWave(); waves[k].u = shore * (k / 4); }

      function frontU(w, v, t) {
        return w.u + 0.018 * noise(v * 3.5, w.ph, t * 0.08) + 0.006 * noise(v * 14, w.ph + 9, t * 0.3);
      }

      function spark(x, y, life, big) {
        if (sparks.length >= maxSparks) return;
        sparks.push({ x, y, life, age: 0, s: big ? DK.rand(2, 4) : DK.rand(1, 2.4) });
      }

      return {
        info: G.n,
        resize() { build(); },
        render(t, dt, env) {
          nextWave -= dt;
          if (nextWave < 0) { nextWave = DK.rand(3.5, 7) / (1 + env.audio.level); spawnWave(); }

          // Wellen rollen an, brechen an der Wasserlinie, laufen aus und ziehen sich zurück
          for (let i = waves.length - 1; i >= 0; i--) {
            const w = waves[i];
            if (!w.back) {
              const toShore = w.u - (shore - 0.14);
              const slow = w.u > shore ? Math.max(0.08, 1 - (w.u - shore) / (w.run - shore)) : 1;
              w.u += w.sp * slow * dt;
              w.b = DK.clamp(toShore / 0.1, 0.12, 1);
              if (w.u >= w.run || slow <= 0.08) w.back = true;
            } else {
              w.u -= 0.012 * dt;
              w.a -= dt * 0.35;
              w.b *= Math.pow(0.4, dt);
              if (w.a <= 0) { waves.splice(i, 1); continue; }
            }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (const w of waves) {
            const bright = w.b * w.a;
            if (bright < 0.02) continue;
            const pts = [];
            for (let k = 0; k <= NP; k++) {
              const v = -0.1 + (k / NP) * 1.2;
              pts.push(toXY(frontU(w, v, t), v));
            }
            const passes = [[L * 0.007, 0.12], [L * 0.0016, 0.75]];
            for (const [lw, al] of passes) {
              ctx.lineWidth = lw;
              ctx.strokeStyle = DK.hsl(G.h, 0.9, 0.62, al * bright);
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
              ctx.stroke();
            }
            // Plankton blitzt entlang der brechenden Welle auf
            const n = Math.round(bright * bright * 30 * env.q * (1 + env.audio.bass));
            for (let k = 0; k < n; k++) {
              const v = Math.random();
              const [x, y] = toXY(frontU(w, v, t) - Math.random() * 0.03, v);
              spark(x, y, DK.rand(0.5, 1.6), false);
            }
          }

          const p = env.pointer;
          if (p.active > 0.3) for (let k = 0; k < 4; k++) spark(p.nx * W + DK.rand(-1, 1) * 15, p.ny * H + DK.rand(-1, 1) * 15, DK.rand(0.6, 1.4), false);
          if (p.pulse) for (let k = 0; k < 140; k++) {
            const a = Math.random() * TAU, r = Math.random() * L * 0.05;
            spark(p.nx * W + Math.cos(a) * r, p.ny * H + Math.sin(a) * r, DK.rand(0.8, 2.2), true);
          }

          // Funken nach Helligkeit in wenige Sammelpfade sortiert – ein Zeichenaufruf pro Stufe
          const LV = 6;
          const buckets = Array.from({ length: LV }, () => new Path2D());
          let alive = 0;
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i];
            s.age += dt;
            if (s.age > s.life) continue;
            sparks[alive++] = s;
            const k = 1 - s.age / s.life;
            buckets[Math.min(LV - 1, Math.floor(k * k * LV))].rect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
          }
          sparks.length = alive;
          for (let b = 0; b < LV; b++) {
            ctx.fillStyle = DK.hsl(G.h, 0.85, 0.7, (b + 0.5) / LV);
            ctx.fill(buckets[b]);
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
