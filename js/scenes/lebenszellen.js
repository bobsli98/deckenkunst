/* Lebenszellen: Conways Spiel des Lebens (und Verwandte) – Zellen erben die Farbe ihrer Eltern */
(function () {
  'use strict';
  const RULES = [
    { n: 'Conway', b: [3], s: [2, 3] },
    { n: 'HighLife', b: [3, 6], s: [2, 3] },
    { n: 'Tag & Nacht', b: [3, 6, 7, 8], s: [3, 4, 6, 7, 8] },
    { n: 'Labyrinth', b: [3], s: [1, 2, 3, 4, 5] },
    { n: 'Korallen', b: [3], s: [4, 5, 6, 7, 8] },
  ];

  DK.register({
    id: 'lebenszellen',
    name: 'Lebenszellen',
    sub: 'Geburt, Überleben, Vererbung',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const rule = DK.pick(RULES.concat(RULES[0], RULES[1])); // Conway etwas häufiger
      const born = new Uint8Array(9), surv = new Uint8Array(9);
      rule.b.forEach((k) => (born[k] = 1));
      rule.s.forEach((k) => (surv[k] = 1));
      const cellPx = Math.max(4, Math.round(Math.min(env.winW, env.winH) / DK.rand(70, 110)));
      const GW = Math.ceil(env.winW / cellPx), GH = Math.ceil(env.winH / cellPx);
      const SIZE = GW * GH;
      let alive = new Uint8Array(SIZE), nextA = new Uint8Array(SIZE);
      let hue = new Float32Array(SIZE), nextH = new Float32Array(SIZE);
      const glow = new Float32Array(SIZE); // Nachleuchten gestorbener Zellen
      const rate = DK.rand(7, 13);
      let acc = 0, quiet = 0, lastPop = 0;

      const off = document.createElement('canvas');
      off.width = GW; off.height = GH;
      const octx = off.getContext('2d');
      const img = octx.createImageData(GW, GH);
      const px = img.data;

      function soup(cx, cy, r, dens) {
        const h0 = Math.random();
        for (let y = cy - r; y <= cy + r; y++) {
          for (let x = cx - r; x <= cx + r; x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r || Math.random() > dens) continue;
            const i = ((y + GH) % GH) * GW + ((x + GW) % GW);
            alive[i] = 1;
            hue[i] = DK.wrap01(h0 + (x - cx) / (r * 6));
          }
        }
      }
      for (let k = 0; k < 6; k++) soup(DK.randInt(0, GW), DK.randInt(0, GH), DK.randInt(6, 14), 0.4);

      function step() {
        let pop = 0;
        for (let y = 0; y < GH; y++) {
          const ym = ((y + GH - 1) % GH) * GW, y0 = y * GW, yp = ((y + 1) % GH) * GW;
          for (let x = 0; x < GW; x++) {
            const xm = (x + GW - 1) % GW, xp = (x + 1) % GW;
            const nb = [ym + xm, ym + x, ym + xp, y0 + xm, y0 + xp, yp + xm, yp + x, yp + xp];
            let c = 0, sx = 0, sy = 0;
            for (let k = 0; k < 8; k++) {
              const j = nb[k];
              if (alive[j]) { c++; sx += Math.cos(hue[j] * DK.TAU); sy += Math.sin(hue[j] * DK.TAU); }
            }
            const i = y0 + x;
            if (alive[i]) {
              nextA[i] = surv[c];
              nextH[i] = hue[i];
              if (!surv[c]) glow[i] = 1;
            } else if (born[c]) {
              nextA[i] = 1;
              // Farbe = Kreismittel der Eltern + kleine Mutation
              nextH[i] = DK.wrap01(Math.atan2(sy, sx) / DK.TAU + DK.rand(-0.015, 0.015));
            } else nextA[i] = 0;
            pop += nextA[i];
          }
        }
        [alive, nextA] = [nextA, alive];
        [hue, nextH] = [nextH, hue];
        return pop;
      }

      return {
        info: `Regel: ${rule.n}`,
        render(t, dt, env) {
          const p = env.pointer;
          if (p.pulse || (p.down && p.active > 0.5)) soup(Math.floor(p.nx * GW), Math.floor(p.ny * GH), p.pulse ? 8 : 3, 0.5);
          acc += dt * rate * (1 + env.audio.level);
          let steps = 0;
          while (acc >= 1 && steps < 3) {
            acc -= 1; steps++;
            const pop = step();
            // Stillstand oder Aussterben: neue Ursuppe einstreuen
            if (Math.abs(pop - lastPop) < SIZE * 0.0005) quiet++; else quiet = Math.max(0, quiet - 2);
            if (pop < SIZE * 0.01 || quiet > rate * 6) {
              soup(DK.randInt(0, GW), DK.randInt(0, GH), DK.randInt(5, 12), 0.45);
              quiet = 0;
            }
            lastPop = pop;
          }

          const fade = Math.pow(0.05, dt);
          for (let i = 0, j = 0; i < SIZE; i++, j += 4) {
            if (alive[i]) {
              const c = DK.hsv2rgb(hue[i] + env.hue * 0.3, 0.75, 1);
              px[j] = c[0] * 255; px[j + 1] = c[1] * 255; px[j + 2] = c[2] * 255;
            } else {
              const g = (glow[i] *= fade);
              const c = g > 0.01 ? DK.hsv2rgb(hue[i] + env.hue * 0.3, 0.9, g * 0.35) : null;
              if (c) { px[j] = c[0] * 255; px[j + 1] = c[1] * 255; px[j + 2] = c[2] * 255; }
              else { px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; }
            }
            px[j + 3] = 255;
          }
          octx.putImageData(img, 0, 0);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, env.w, env.h);
          ctx.imageSmoothingEnabled = false;
          const sx = env.w / env.winW;
          ctx.drawImage(off, 0, 0, GW * cellPx * sx, GH * cellPx * sx);
          // weiches Glühen darüber
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35;
          ctx.drawImage(off, 0, 0, GW * cellPx * sx, GH * cellPx * sx);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
