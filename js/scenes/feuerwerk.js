/* Feuerwerk: Päonien, Ringe, Trauerweiden und Knisterkugeln. Klick = eigene Rakete, Musik = mehr Raketen */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const TYPES = ['Päonie', 'Ring', 'Weide', 'Knister', 'Doppel'];

  DK.register({
    id: 'feuerwerk',
    name: 'Feuerwerk',
    sub: 'Hanabi – Blumen aus Feuer',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const MAX = Math.round(3500 * env.q + 800);
      // Teilchen als Struktur aus Arrays
      const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
      const life = new Float32Array(MAX), age = new Float32Array(MAX), hue = new Float32Array(MAX), drag = new Float32Array(MAX);
      const kind = new Uint8Array(MAX); // 0 Funke, 1 Glitzer, 2 Weide
      let n = 0;
      const rockets = [];
      const paths = [];
      const flashes = [];
      let nextLaunch = 0.5, lastBass = 0;

      function add(x, y, vxx, vyy, l, h, k, dr) {
        if (n >= MAX) return;
        px[n] = x; py[n] = y; vx[n] = vxx; vy[n] = vyy; life[n] = l; age[n] = 0; hue[n] = h; kind[n] = k; drag[n] = dr;
        n++;
      }

      function burst(x, y, type, M) {
        const h = Math.random();
        const h2 = DK.wrap01(h + DK.rand(0.3, 0.6));
        const sp = M * DK.rand(0.35, 0.55);
        const cnt = Math.round(DK.rand(140, 240) * env.q + 60);
        flashes.push({ x, y, age: 0, h });
        if (type === 'Ring') {
          const tilt = Math.random() * TAU, sq = DK.rand(0.3, 1);
          for (let i = 0; i < cnt; i++) {
            const a = (i / cnt) * TAU;
            let ux = Math.cos(a), uy = Math.sin(a) * sq;
            const c = Math.cos(tilt), s = Math.sin(tilt);
            add(x, y, (ux * c - uy * s) * sp, (ux * s + uy * c) * sp, DK.rand(1.4, 2.0), h, 0, 1.6);
          }
        } else if (type === 'Weide') {
          for (let i = 0; i < cnt; i++) {
            const a = Math.random() * TAU, r = Math.sqrt(Math.random());
            add(x, y, Math.cos(a) * sp * r * 0.8, Math.sin(a) * sp * r * 0.8, DK.rand(2.5, 3.6), 0.11, 2, 0.9);
          }
        } else {
          for (let i = 0; i < cnt; i++) {
            const a = Math.random() * TAU, r = Math.cbrt(Math.random());
            const hh = type === 'Doppel' && i % 2 ? h2 : h;
            add(x, y, Math.cos(a) * sp * r, Math.sin(a) * sp * r, DK.rand(1.2, 2.2), hh, type === 'Knister' ? 1 : 0, 1.4);
          }
        }
      }

      function launch(w, h, M, tx, ty) {
        const x = tx !== undefined ? tx : DK.rand(0.15, 0.85) * w;
        const y = ty !== undefined ? ty : DK.rand(0.15, 0.7) * h;
        // Rakete steigt vom unteren Bildrand auf
        const sx = x + DK.rand(-0.1, 0.1) * w, sy = h + 10;
        const T = DK.rand(0.9, 1.4);
        rockets.push({ x: sx, y: sy, tx: x, ty: y, t: 0, T, sx, sy, type: DK.pick(TYPES) });
      }

      return {
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          const g = M * 0.12; // Schwerkraft nach „unten“

          nextLaunch -= dt;
          const bassHit = env.audio.bass > 0.75 && lastBass <= 0.75;
          lastBass = env.audio.bass;
          if (nextLaunch < 0 || bassHit) {
            nextLaunch = DK.rand(0.6, 2.2) / (1 + env.audio.level);
            const salvo = Math.random() < 0.15 ? DK.randInt(3, 5) : 1;
            for (let i = 0; i < salvo; i++) launch(w, h, M);
          }
          if (env.pointer.pulse) launch(w, h, M, env.pointer.nx * w, env.pointer.ny * h);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';

          // Raketen
          ctx.fillStyle = 'rgba(255,210,150,0.9)';
          for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.t += dt;
            const k = Math.min(1, r.t / r.T), e = 1 - Math.pow(1 - k, 2);
            r.x = DK.lerp(r.sx, r.tx, e); r.y = DK.lerp(r.sy, r.ty, e);
            ctx.fillRect(r.x - 1.5, r.y - 1.5, 3, 3);
            if (Math.random() < 0.6) add(r.x, r.y, DK.rand(-1, 1) * M * 0.01, M * 0.03, 0.4, 0.08, 1, 2);
            if (k >= 1) { burst(r.x, r.y, r.type, M); rockets.splice(i, 1); }
          }

          // Funken: nach Farbton und Helligkeit in Sammelpfade sortiert – wenige Zeichenaufrufe
          const sz = Math.max(1.8, M * 0.0045);
          const HB = 16, AB = 4;
          for (let b = 0; b < HB * AB; b++) paths[b] = null;
          let j = 0;
          for (let i = 0; i < n; i++) {
            age[i] += dt;
            if (age[i] > life[i]) continue;
            const dd = Math.exp(-drag[i] * dt);
            vx[i] *= dd; vy[i] = vy[i] * dd + g * dt * (kind[i] === 2 ? 0.5 : 1);
            const ox = px[i], oy = py[i];
            px[i] += vx[i] * dt; py[i] += vy[i] * dt;
            const k = age[i] / life[i];
            let a = 1 - k * k;
            if (kind[i] === 1) a *= Math.random() < 0.5 ? 1 : 0.15;
            const bucket = (Math.floor(hue[i] * HB) % HB) * AB + Math.min(AB - 1, Math.floor(a * AB));
            const path = paths[bucket] || (paths[bucket] = new Path2D());
            path.moveTo(ox, oy);
            path.lineTo(px[i] + 0.01, py[i]);
            // kompaktieren
            if (j !== i) {
              px[j] = px[i]; py[j] = py[i]; vx[j] = vx[i]; vy[j] = vy[i];
              life[j] = life[i]; age[j] = age[i]; hue[j] = hue[i]; kind[j] = kind[i]; drag[j] = drag[i];
            }
            j++;
          }
          n = j;
          for (let i = flashes.length - 1; i >= 0; i--) {
            const f = flashes[i];
            f.age += dt;
            if (f.age > 0.6) { flashes.splice(i, 1); continue; }
            const s = M * 0.5 * (0.5 + f.age);
            ctx.globalAlpha = 0.6 * (1 - f.age / 0.6);
            ctx.drawImage(DK.glowSprite(f.h, 0.5, 0.6), f.x - s / 2, f.y - s / 2, s, s);
          }
          ctx.globalAlpha = 1;
          ctx.lineWidth = sz;
          ctx.lineCap = 'round';
          for (let b = 0; b < HB * AB; b++) {
            if (!paths[b]) continue;
            const hb = Math.floor(b / AB), ab = b % AB;
            ctx.strokeStyle = DK.hsl((hb + 0.5) / HB, 0.9, 0.55 + ab * 0.08, (ab + 1) / AB);
            ctx.stroke(paths[b]);
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
