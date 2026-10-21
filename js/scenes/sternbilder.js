/* Sternbilder: über einem funkelnden Himmel zeichnen sich nacheinander die bekannten Figuren – mit Namen */
(function () {
  'use strict';
  const TAU = DK.TAU;

  // grobe, wiedererkennbare Formen (Koordinaten frei skaliert), e = Verbindungslinien
  const FIGS = [
    { n: 'Großer Wagen', d: 'Teil des Grossen Bären', s: [[0, 0], [1, 0.15], [1.9, 0.3], [2.8, 0.2], [3.3, -0.55], [4.35, -0.4], [4.4, 0.4]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
    { n: 'Kassiopeia', d: 'die eitle Königin', s: [[0, 0.2], [1, 1], [2, 0.4], [3, 1.1], [4, 0.1]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { n: 'Orion', d: 'der Himmelsjäger', s: [[0, 0], [2.1, 0.3], [0.85, 1.7], [1.15, 1.8], [1.45, 1.9], [0.3, 3.4], [2.5, 3.1], [1.1, -0.8]], e: [[0, 7], [7, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]], red: 0 },
    { n: 'Schwan', d: 'fliegt die Milchstrasse entlang', s: [[0, 0], [0, 1.2], [0, 3.1], [-1.4, 0.8], [1.4, 1.6], [-2.2, 0.3], [2.1, 2.3]], e: [[0, 1], [1, 2], [3, 1], [1, 4], [5, 3], [4, 6]] },
    { n: 'Leier', d: 'mit der hellen Wega', s: [[0, 0], [0.5, 0.6], [0.3, 1.3], [1.0, 1.4], [1.2, 0.7]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
    { n: 'Skorpion', d: 'mit dem roten Antares', s: [[-0.5, -0.3], [0, 0], [0.4, -0.5], [0.3, 0.6], [0.5, 1.2], [0.8, 1.8], [0.9, 2.5], [1.3, 3.1], [2.0, 3.5], [2.6, 3.3], [2.8, 2.7]], e: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]], red: 4 },
    { n: 'Löwe', d: 'mit Regulus, dem Herzstern', s: [[0, 2], [0.1, 1.2], [0.5, 0.6], [1.1, 0.4], [1.5, 0.9], [2.6, 1.3], [3.7, 1.9], [2.6, 2.2]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [7, 0]] },
    { n: 'Kleiner Wagen', d: 'mit dem Polarstern an der Deichsel', s: [[0, 0], [0.9, 0.2], [1.7, 0.5], [2.4, 0.9], [2.6, 1.7], [3.4, 1.9], [3.3, 1.1]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
    { n: 'Kreuz des Südens', d: 'Wegweiser der Seefahrer', s: [[0, 0], [0, 2.2], [-0.9, 1.0], [0.8, 1.2], [0.4, 1.6]], e: [[0, 1], [2, 3]] },
  ];

  DK.register({
    id: 'sternbilder',
    name: 'Sternbilder',
    sub: 'Geschichten zwischen den Sternen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const order = DK.shuffle(FIGS.slice());
      let idx = 0, nextT = 1;
      const active = [];
      let bg, W, H, M, field = [];

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        grd.addColorStop(0, 'hsl(228, 40%, 7%)');
        grd.addColorStop(1, 'hsl(235, 45%, 2%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        // Milchstrassenband
        const a = Math.random() * Math.PI, c = Math.cos(a), s = Math.sin(a);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2600 * (0.5 + env.q * 0.5); i++) {
          const u = DK.rand(-1, 1) * Math.hypot(W, H) * 0.6, v = (Math.random() + Math.random() + Math.random() - 1.5) * M * 0.16;
          g.fillStyle = `rgba(200,210,255,${DK.rand(0.03, 0.12)})`;
          g.fillRect(W / 2 + u * c - v * s, H / 2 + u * s + v * c, 1.2, 1.2);
        }
        g.globalCompositeOperation = 'source-over';
        field = [];
        for (let i = 0; i < (W * H) / 3500; i++) field.push({ x: Math.random() * W, y: Math.random() * H, b: Math.pow(Math.random(), 2.5), ph: Math.random() * TAU });
      }
      build();

      function place(fig) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of fig.s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const size = M * DK.rand(0.38, 0.55);
        const sc = size / Math.max(x1 - x0, y1 - y0);
        const rot = DK.rand(-0.5, 0.5), c = Math.cos(rot), s = Math.sin(rot);
        const cx = DK.rand(0.32, 0.68) * W, cy = DK.rand(0.3, 0.62) * H;
        const pts = fig.s.map(([x, y]) => {
          const px = (x - (x0 + x1) / 2) * sc, py = (y - (y0 + y1) / 2) * sc;
          return [cx + px * c - py * s, cy + px * s + py * c];
        });
        let maxY = -Infinity;
        for (const pt of pts) maxY = Math.max(maxY, pt[1]);
        active.push({ fig, pts, age: 0, lx: cx, ly: Math.min(H - M * 0.08, maxY + M * 0.07) });
      }

      return {
        resize() { build(); active.length = 0; },
        render(t, dt, env) {
          nextT -= dt;
          if ((nextT < 0 && active.length < 2) || env.pointer.pulse) {
            place(order[idx % order.length]);
            idx++;
            nextT = DK.rand(13, 17);
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          for (const s of field) {
            const tw = 0.6 + 0.4 * Math.sin(t * (1 + s.b * 2) + s.ph);
            ctx.fillStyle = `rgba(225,230,255,${(0.15 + s.b * 0.75) * tw})`;
            const z = 1 + s.b * 1.6;
            ctx.fillRect(s.x - z / 2, s.y - z / 2, z, z);
          }

          // Ablauf: Sterne leuchten auf → Linien ziehen sich → Name → halten → verblassen
          for (let i = active.length - 1; i >= 0; i--) {
            const A = active[i];
            A.age += dt;
            const T_STAR = 2, T_LINE = 4, T_HOLD = 9, T_FADE = 3;
            const end = T_STAR + T_LINE + T_HOLD + T_FADE;
            if (A.age > end) { active.splice(i, 1); continue; }
            const fade = A.age > end - T_FADE ? 1 - (A.age - (end - T_FADE)) / T_FADE : 1;
            const starK = Math.min(1, A.age / T_STAR) * fade;
            const lineK = DK.clamp((A.age - T_STAR) / T_LINE, 0, 1);
            const nameK = DK.clamp((A.age - T_STAR - T_LINE * 0.7) / 1.5, 0, 1) * fade;

            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1, M * 0.0022);
            const E = A.fig.e.length;
            for (let k = 0; k < E; k++) {
              const part = DK.clamp(lineK * E - k, 0, 1);
              if (part <= 0) continue;
              const [a, b] = A.fig.e[k];
              const [ax, ay] = A.pts[a], [bx, by] = A.pts[b];
              ctx.strokeStyle = `rgba(150,190,255,${0.45 * fade})`;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(ax + (bx - ax) * part, ay + (by - ay) * part);
              ctx.stroke();
            }
            for (let k = 0; k < A.pts.length; k++) {
              const [x, y] = A.pts[k];
              const red = A.fig.red === k;
              const g = M * 0.05;
              ctx.globalAlpha = starK * 0.6;
              ctx.drawImage(DK.glowSprite(red ? 0.03 : 0.6, red ? 0.8 : 0.3, 0.7, 64), x - g / 2, y - g / 2, g, g);
              ctx.globalAlpha = starK;
              ctx.fillStyle = red ? 'rgb(255,170,140)' : 'rgb(235,240,255)';
              ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, M * 0.004), 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = 1;
            if (nameK > 0) {
              ctx.globalCompositeOperation = 'source-over';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = `rgba(215,225,255,${0.85 * nameK})`;
              ctx.font = `200 ${Math.round(M * 0.034)}px "Segoe UI", system-ui, sans-serif`;
              if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(M * 0.008)}px`;
              ctx.fillText(A.fig.n.toUpperCase(), A.lx, A.ly);
              if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
              ctx.fillStyle = `rgba(160,175,215,${0.75 * nameK})`;
              ctx.font = `300 ${Math.round(M * 0.018)}px "Segoe UI", system-ui, sans-serif`;
              ctx.fillText(A.fig.d, A.lx, A.ly + M * 0.035);
              ctx.globalCompositeOperation = 'lighter';
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
