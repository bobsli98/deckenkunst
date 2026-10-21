/* Neonnacht: in einer Gasse in Shinjuku liegen und nach oben schauen – Fassaden voller Leuchtschilder, Regen von oben */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const WORDS = ['ラーメン', 'カラオケ', '居酒屋', '寿司', '焼鳥', '営業中', '喫茶', '本屋', '酒', 'ホテル', '占い', '餃子', 'うどん', 'たこ焼き', '24時間', '薬', 'バー', '麻雀', 'ゲーム', '映画', '時計', '眼鏡', '銭湯', '天ぷら', '定食', '古着', '花屋', '洋食', '大衆酒場'];
  const MOODS = [
    { n: 'Shinjuku im Regen', hues: [0.92, 0.55, 0.8, 0.0, 0.48], rain: 1, sky: ['#3a1640', '#120818'], density: 1 },
    { n: 'Dotonbori-Gefühl', hues: [0.0, 0.08, 0.13, 0.95, 0.55], rain: 0.3, sky: ['#40180c', '#140806'], density: 1.2 },
    { n: 'Golden-Gai-Gasse', hues: [0.06, 0.1, 0.02, 0.9], rain: 0.6, sky: ['#2a1c10', '#0c0806'], density: 0.8 },
  ];
  const FONT = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", "MS Gothic", sans-serif';

  DK.register({
    id: 'neonnacht',
    name: 'Neonnacht',
    sub: 'Tokio, den Kopf im Nacken',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const mood = DK.pick(MOODS);
      const words = WORDS;
      let city, W, H, C, signs, rain = [], clouds = [];
      const K = 1.6; // wie schnell die Fassaden mit der Höhe zur Mitte hin schrumpfen

      // Welt → Bild: Wand bei x = ±1, y entlang der Gasse, h = Höhe. Alles schrumpft mit der Höhe zur Bildmitte.
      function proj(x, y, h) {
        const s = 1 / (1 + h * K);
        return [C.x + x * C.sx * s, C.y + y * C.sx * s];
      }

      function quad(g, pts) {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
      }

      // Schild als Rechteck auf der Fassade: [y0, y1] × [h0, h1]; Text per affiner Näherung
      function drawSign(g, sg) {
        const { x, y0, y1, h0, h1, hue, word, vertical } = sg;
        const p00 = proj(x, y0, h0), p10 = proj(x, y1, h0), p01 = proj(x, y0, h1), p11 = proj(x, y1, h1);
        quad(g, [p00, p10, p11, p01]);
        g.fillStyle = DK.hsl(hue, 0.6, 0.08, 0.95);
        g.fill();
        g.lineWidth = Math.max(1, Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) * 0.06);
        g.strokeStyle = DK.hsl(hue, 1, 0.62);
        g.stroke();
        // Text im Schild-Raster (100 Einheiten pro Kante): oben = Richtung Himmel, nie gespiegelt
        let O = p01, U = [p11[0] - p01[0], p11[1] - p01[1]], V = [p00[0] - p01[0], p00[1] - p01[1]];
        if (U[0] * V[1] - U[1] * V[0] < 0) {
          O = p11; U = [p01[0] - p11[0], p01[1] - p11[1]]; V = [p10[0] - p11[0], p10[1] - p11[1]];
        }
        g.save();
        g.setTransform(U[0] / 100, U[1] / 100, V[0] / 100, V[1] / 100, O[0], O[1]);
        g.fillStyle = DK.hsl(hue, 1, 0.75);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const chars = [...word];
        const n = chars.length;
        if (vertical) {
          // Tategaki: Zeichen untereinander, jedes in seiner eigenen Zelle
          g.font = `700 78px ${FONT}`;
          chars.forEach((ch, i) => {
            g.save();
            g.translate(50, ((i + 0.5) * 100) / n);
            g.scale(1, 1 / n);
            g.fillText(ch, 0, 0);
            g.restore();
          });
        } else {
          g.font = `700 64px ${FONT}`;
          const tw = g.measureText(word).width || 1;
          g.translate(50, 52);
          g.scale(Math.min(1, 90 / tw), 1);
          g.fillText(word, 0, 0);
        }
        g.restore();
        return [p00, p10, p11, p01];
      }

      function build() {
        W = env.w; H = env.h;
        const M = Math.min(W, H);
        C = { x: W / 2, y: H / 2, sx: W / 2 * 1.02 };
        city = document.createElement('canvas');
        city.width = W; city.height = H;
        const g = city.getContext('2d');
        // Himmel: von Neonlicht violett/orange angeleuchtet
        const grd = g.createRadialGradient(C.x, C.y, 0, C.x, C.y, Math.max(W, H) * 0.6);
        grd.addColorStop(0, mood.sky[0]);
        grd.addColorStop(1, mood.sky[1]);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);

        signs = [];
        const yMax = (H / 2) / C.sx * 1.15;
        for (const side of [-1, 1]) {
          let y = -yMax;
          while (y < yMax) {
            const bw = DK.rand(0.35, 0.9);
            const top = DK.rand(2.5, 7);
            const y0 = y, y1 = Math.min(yMax + 0.2, y + bw);
            // Fassade
            quad(g, [proj(side, y0, 0), proj(side, y1, 0), proj(side, y1, top), proj(side, y0, top)]);
            const lightness = DK.rand(4, 8);
            g.fillStyle = `hsl(${DK.randInt(230, 280)}, 18%, ${lightness}%)`;
            g.fill();
            g.strokeStyle = 'rgba(0,0,0,0.6)';
            g.lineWidth = 1;
            g.stroke();
            // Fenster in Reihen (Stockwerke werden nach oben enger)
            for (let h = 0.25; h < top - 0.2; h += 0.35) {
              for (let wy = y0 + 0.05; wy < y1 - 0.08; wy += 0.12) {
                if (Math.random() < 0.55) continue;
                const warm = Math.random() < 0.6;
                g.fillStyle = warm ? `hsla(40, 70%, ${DK.randInt(45, 70)}%, ${DK.rand(0.25, 0.7)})` : `hsla(200, 50%, ${DK.randInt(50, 75)}%, ${DK.rand(0.2, 0.5)})`;
                quad(g, [proj(side, wy, h), proj(side, wy + 0.07, h), proj(side, wy + 0.07, h + 0.18), proj(side, wy, h + 0.18)]);
                g.fill();
              }
            }
            // Neonschilder an dieser Fassade
            const nSigns = Math.round(DK.rand(1, 4) * mood.density);
            for (let k = 0; k < nSigns; k++) {
              const vertical = Math.random() < 0.55;
              const word = DK.pick(words);
              const len = [...word].length;
              const h0 = DK.rand(0.05, Math.max(0.15, top * 0.55));
              const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
              let sw, h1;
              // Schildmasse im Bildraum wählen, damit die Zeichen trotz Perspektive quadratisch wirken
              if (vertical) {
                sw = Math.min(bw * 0.8, DK.rand(0.09, 0.14));
                const cell = dist(proj(side, y0, h0), proj(side, y0 + sw, h0));
                h1 = h0 + 0.02;
                while (h1 < h0 + 4 && dist(proj(side, y0, h0), proj(side, y0, h1)) < cell * len * 1.05) h1 += 0.02;
              } else {
                h1 = h0 + DK.rand(0.12, 0.22);
                const hS = dist(proj(side, y0, h0), proj(side, y0, h1));
                sw = Math.min(bw * 0.95, (len * hS * 0.95 * (1 + h0 * K)) / C.sx);
              }
              if (h1 > top - 0.05) continue; // Schild würde übers Dach hinausragen
              const sy0 = y0 + Math.random() * Math.max(0.01, bw - sw);
              signs.push({
                x: side, y0: sy0, y1: sy0 + sw, h0, h1, hue: DK.pick(mood.hues) + DK.rand(-0.02, 0.02),
                word, vertical, flick: Math.random() < 0.18, ph: Math.random() * 100, chase: !vertical && Math.random() < 0.3,
              });
            }
            y = y1 + DK.rand(0, 0.04);
          }
        }
        // Schilder von hoch (fern) nach tief (nah) zeichnen
        signs.sort((a, b) => b.h0 - a.h0);
        for (const sg of signs) sg.poly = drawSign(g, sg);
        clouds = Array.from({ length: 6 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: M * DK.rand(0.2, 0.4), v: M * DK.rand(0.01, 0.03) }));
        rain = [];
      }
      build();

      return {
        info: mood.n,
        resize() { build(); },
        render(t, dt, env) {
          const M = Math.min(W, H);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(city, 0, 0);

          // Lichtsmog über dem Himmelsstreifen
          ctx.globalCompositeOperation = 'lighter';
          for (const c of clouds) {
            c.y += c.v * dt;
            if (c.y - c.s > H) c.y = -c.s;
            ctx.globalAlpha = 0.07;
            ctx.drawImage(DK.glowSprite(mood.hues[0], 0.6, 0.5, 64), c.x - c.s, c.y - c.s * 0.5, c.s * 2, c.s);
          }

          // Leuchten der Schilder, manche flackern, manche haben Lauflichter
          for (const sg of signs) {
            const [a, b, c2, d] = sg.poly;
            const cx = (a[0] + c2[0]) / 2, cy = (a[1] + c2[1]) / 2;
            const size = Math.hypot(c2[0] - a[0], c2[1] - a[1]) * 1.8;
            let on = 1;
            if (sg.flick) {
              const f = Math.sin(t * 3 + sg.ph) + Math.sin(t * 17.3 + sg.ph * 2);
              on = f > 1.3 ? 0.15 : 1;
            }
            on *= 1 + env.audio.bass * 0.6;
            ctx.globalAlpha = 0.28 * on;
            ctx.drawImage(DK.glowSprite(sg.hue, 0.9, 0.55, 64), cx - size / 2, cy - size / 2, size, size);
            if (on < 0.5) {
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = 0.75;
              ctx.fillStyle = '#05030a';
              ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
              ctx.globalCompositeOperation = 'lighter';
            }
            if (sg.chase) {
              // Lichterkette am unteren Rand des Schilds
              const n = 10, k = Math.floor(t * 8 + sg.ph) % 3;
              ctx.globalAlpha = 0.9;
              ctx.fillStyle = DK.hsl(sg.hue + 0.1, 1, 0.75);
              for (let i = 0; i < n; i++) {
                if (i % 3 !== k) continue;
                const u = (i + 0.5) / n;
                const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
                ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
              }
            }
          }

          // Regen fällt einem entgegen: Striche, die aus der Mitte nach aussen schiessen
          const target = Math.round((150 * env.q + 60) * mood.rain);
          while (rain.length < target) rain.push({ a: Math.random() * TAU, r: DK.rand(0.01, 0.3) * M, v: DK.rand(0.8, 1.6) });
          const path = new Path2D();
          for (let i = rain.length - 1; i >= 0; i--) {
            const d = rain[i];
            const r0 = d.r;
            d.r *= 1 + d.v * dt * 1.5;
            d.r += M * 0.02 * dt;
            if (d.r > Math.hypot(W, H)) { rain[i] = { a: Math.random() * TAU, r: DK.rand(0.01, 0.06) * M, v: DK.rand(0.8, 1.6) }; continue; }
            const c = Math.cos(d.a), s = Math.sin(d.a);
            path.moveTo(C.x + c * r0, C.y + s * r0);
            path.lineTo(C.x + c * d.r, C.y + s * d.r);
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(210,200,255,0.22)';
          ctx.lineWidth = Math.max(1, M * 0.0016);
          ctx.stroke(path);
          if (env.pointer.pulse) for (const sg of signs) sg.ph += Math.random() * 5;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        },
      };
    },
  });
})();
