/* Schleimpilz (Physarum): zehntausende Agenten folgen Duftspuren und weben Netzwerke */
(function () {
  'use strict';

  DK.register({
    id: 'schleimpilz',
    name: 'Schleimpilz',
    sub: 'Ein Netzwerk ohne Gehirn',
    type: '2d',
    scale: 1,
    adaptive: false,
    create(ctx, env) {
      // Rastergrösse und Agentenzahl bewusst gedeckelt: die Simulation läuft auf dem Prozessor
      const GW = Math.round(DK.clamp((env.winW / 5) * (env.q < 1 ? 0.7 : 1), 160, 340));
      const GH = Math.max(100, Math.round((GW * env.winH) / env.winW));
      const SIZE = GW * GH;
      const NS = DK.pick([1, 2, 3, 3]);
      const AG = Math.round(SIZE * DK.rand(0.28, 0.4));
      const repel = DK.rand(0.6, 1.2);
      const decay = DK.rand(0.86, 0.93);
      const hueBase = Math.random();
      const satur = DK.rand(0.55, 0.85);

      const species = [];
      for (let s = 0; s < NS; s++) {
        species.push({
          sa: (DK.rand(20, 50) * Math.PI) / 180,
          sd: DK.rand(5, 12),
          ra: (DK.rand(15, 45) * Math.PI) / 180,
          sp: DK.rand(0.8, 1.5),
          dep: 5,
          hue: hueBase + s / NS,
          col: [1, 1, 1],
        });
      }
      for (const P of species) { P.cS = Math.cos(P.sa); P.sS = Math.sin(P.sa); }

      const ax = new Float32Array(AG), ay = new Float32Array(AG), aa = new Float32Array(AG);
      const as = new Uint8Array(AG);
      const trail = [];
      for (let s = 0; s < NS; s++) trail.push(new Float32Array(SIZE));
      let tmp = new Float32Array(SIZE);

      // Startformation
      const layout = DK.pick(['ring', 'zentrum', 'zufall', 'ringe']);
      const cx = GW / 2, cy = GH / 2;
      for (let i = 0; i < AG; i++) {
        const s = i % NS;
        as[i] = s;
        if (layout === 'zufall') {
          ax[i] = Math.random() * GW; ay[i] = Math.random() * GH; aa[i] = Math.random() * DK.TAU;
        } else if (layout === 'zentrum') {
          const a = Math.random() * DK.TAU, r = Math.random() * GH * 0.08;
          ax[i] = cx + Math.cos(a) * r; ay[i] = cy + Math.sin(a) * r; aa[i] = a;
        } else {
          const a = Math.random() * DK.TAU;
          const R = layout === 'ring' ? GH * 0.42 : GH * (0.15 + 0.13 * s);
          const r = R + DK.rand(-2, 2);
          ax[i] = cx + Math.cos(a) * r; ay[i] = cy + Math.sin(a) * r; aa[i] = Math.random() * DK.TAU;
        }
      }

      // Futterquellen ziehen die Netze an
      const food = [];
      const nFood = DK.randInt(0, 5);
      for (let i = 0; i < nFood; i++) food.push({ x: Math.random() * GW, y: Math.random() * GH, life: DK.rand(10, 30) });

      const off = document.createElement('canvas');
      off.width = GW; off.height = GH;
      const octx = off.getContext('2d');
      const img = octx.createImageData(GW, GH);
      const px = img.data;
      for (let i = 3; i < px.length; i += 4) px[i] = 255;
      const glow = document.createElement('canvas');
      glow.width = Math.max(8, GW >> 2); glow.height = Math.max(8, GH >> 2);
      const gctx = glow.getContext('2d');

      function sense(s, x, y) {
        let xi = x | 0, yi = y | 0;
        if (xi < 0) xi += GW; else if (xi >= GW) xi -= GW;
        if (yi < 0) yi += GH; else if (yi >= GH) yi -= GH;
        const idx = yi * GW + xi;
        let v = trail[s][idx];
        for (let o = 0; o < NS; o++) if (o !== s) v -= trail[o][idx] * repel;
        return v;
      }

      function deposit(cxp, cyp, r, amount) {
        const r2 = r * r;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r2) continue;
            let x = (cxp + dx) | 0, y = (cyp + dy) | 0;
            x = ((x % GW) + GW) % GW; y = ((y % GH) + GH) % GH;
            for (let s = 0; s < NS; s++) trail[s][y * GW + x] += amount;
          }
        }
      }

      function diffuse(src, dst) {
        const k = decay / 9;
        for (let y = 0; y < GH; y++) {
          const ym = (y === 0 ? GH - 1 : y - 1) * GW, y0 = y * GW, yp = (y === GH - 1 ? 0 : y + 1) * GW;
          for (let x = 0; x < GW; x++) {
            const xm = x === 0 ? GW - 1 : x - 1, xp = x === GW - 1 ? 0 : x + 1;
            dst[y0 + x] = (src[ym + xm] + src[ym + x] + src[ym + xp] + src[y0 + xm] + src[y0 + x] +
              src[y0 + xp] + src[yp + xm] + src[yp + x] + src[yp + xp]) * k;
          }
        }
      }

      return {
        info: `${NS === 1 ? 'Eine Art' : NS + ' rivalisierende Arten'} · ${AG.toLocaleString('de-CH')} Agenten`,
        render(t, dt, env) {
          // Agenten bewegen
          for (let i = 0; i < AG; i++) {
            const s = as[i], P = species[s];
            const x = ax[i], y = ay[i];
            let a = aa[i];
            // Fühler links/rechts per Additionstheorem aus einem einzigen cos/sin-Paar
            const ca = Math.cos(a), sa = Math.sin(a);
            const d = P.sd, cS = P.cS, sS = P.sS;
            const fC = sense(s, x + ca * d, y + sa * d);
            const fL = sense(s, x + (ca * cS + sa * sS) * d, y + (sa * cS - ca * sS) * d);
            const fR = sense(s, x + (ca * cS - sa * sS) * d, y + (sa * cS + ca * sS) * d);
            if (fC > fL && fC > fR) { /* geradeaus */ }
            else if (fC < fL && fC < fR) a += (Math.random() - 0.5) * 2 * P.ra;
            else if (fL > fR) a -= P.ra;
            else if (fR > fL) a += P.ra;
            let nx = x + Math.cos(a) * P.sp, ny = y + Math.sin(a) * P.sp;
            if (nx < 0) nx += GW; else if (nx >= GW) nx -= GW;
            if (ny < 0) ny += GH; else if (ny >= GH) ny -= GH;
            ax[i] = nx; ay[i] = ny; aa[i] = a;
            const xi = Math.min(GW - 1, nx | 0), yi = Math.min(GH - 1, ny | 0);
            trail[s][yi * GW + xi] += P.dep;
          }

          // Futter, Zeiger, Klick-Explosion
          for (const f of food) {
            f.life -= dt;
            if (f.life < 0) { f.x = Math.random() * GW; f.y = Math.random() * GH; f.life = DK.rand(10, 30); }
            deposit(f.x, f.y, 2, 6);
          }
          const p = env.pointer;
          const pgx = p.nx * GW, pgy = p.ny * GH;
          if (p.active > 0.3) deposit(pgx, pgy, 3, 10 * p.active);
          if (p.pulse) {
            const R = GH * 0.15;
            for (let i = 0; i < AG; i++) {
              const dx = ax[i] - pgx, dy = ay[i] - pgy;
              if (dx * dx + dy * dy < R * R) aa[i] = Math.atan2(dy, dx);
            }
          }

          // Duft verteilen und verblassen lassen
          for (let s = 0; s < NS; s++) {
            diffuse(trail[s], tmp);
            const keep = trail[s];
            trail[s] = tmp;
            tmp = keep;
          }

          // Einfärben
          for (let s = 0; s < NS; s++) {
            const c = DK.hsv2rgb(species[s].hue + env.hue * 0.5, satur, 1);
            species[s].col = c;
          }
          const c0 = species[0].col, c1 = NS > 1 ? species[1].col : c0, c2 = NS > 2 ? species[2].col : c0;
          const t0 = trail[0], t1 = NS > 1 ? trail[1] : null, t2 = NS > 2 ? trail[2] : null;
          const K = 18 * (1 - env.audio.bass * 0.4);
          for (let i = 0, j = 0; i < SIZE; i++, j += 4) {
            let v = t0[i], m = v / (v + K);
            let r = c0[0] * m, g = c0[1] * m, b = c0[2] * m;
            if (t1) { v = t1[i]; m = v / (v + K); r += c1[0] * m; g += c1[1] * m; b += c1[2] * m; }
            if (t2) { v = t2[i]; m = v / (v + K); r += c2[0] * m; g += c2[1] * m; b += c2[2] * m; }
            px[j] = r * 255; px[j + 1] = g * 255; px[j + 2] = b * 255;
          }
          octx.putImageData(img, 0, 0);

          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(off, 0, 0, env.w, env.h);
          gctx.drawImage(off, 0, 0, glow.width, glow.height);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5;
          ctx.drawImage(glow, 0, 0, env.w, env.h);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
