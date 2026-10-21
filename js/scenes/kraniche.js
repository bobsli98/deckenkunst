/* Tausend Kraniche (Senbazuru): Origami-Kraniche als kleine 3D-Papiermodelle kreisen über einem */
(function () {
  'use strict';
  const TAU = DK.TAU;

  // Kranich aus Dreiecken: x vorne, y rechts, z oben. W = Flügelschlag-Platzhalter
  const W = 'W';
  const MODEL = [
    // Flügel links/rechts (Spitze hebt und senkt sich)
    { v: [[0.3, 0, 0.02], [-0.3, 0, 0.02], [-0.1, -1.45, W]], c: 0 },
    { v: [[0.3, 0, 0.02], [-0.3, 0, 0.02], [-0.1, 1.45, W]], c: 0 },
    // Rumpf (Kiel nach unten)
    { v: [[0.38, 0, 0], [-0.38, 0, 0], [0, -0.12, -0.28]], c: 1 },
    { v: [[0.38, 0, 0], [-0.38, 0, 0], [0, 0.12, -0.28]], c: 1 },
    // Hals mit Kopf, Schwanz
    { v: [[0.22, -0.06, 0], [0.22, 0.06, 0], [1.05, 0, 0.5]], c: 2 },
    { v: [[1.05, 0, 0.5], [0.96, 0, 0.46], [1.22, 0, 0.36]], c: 2 },
    { v: [[-0.22, -0.06, 0], [-0.22, 0.06, 0], [-1.1, 0, 0.48]], c: 2 },
  ];

  const PAPERS = [
    { n: 'Rotes Washi', cols: [[0.0, 0.75, 0.55], [0.02, 0.6, 0.45], [0.03, 0.7, 0.6]] },
    { n: 'Pastell', cols: [[0.95, 0.45, 0.78], [0.55, 0.4, 0.75], [0.14, 0.55, 0.78], [0.33, 0.35, 0.72]] },
    { n: 'Gold & Weiss', cols: [[0.12, 0.7, 0.6], [0.1, 0.1, 0.92]] },
    { n: 'Regenbogen', cols: [[0.0, 0.7, 0.6], [0.08, 0.8, 0.6], [0.15, 0.8, 0.6], [0.35, 0.6, 0.5], [0.58, 0.7, 0.6], [0.75, 0.6, 0.6]] },
  ];
  const SKIES = [
    ['hsl(265, 35%, 16%)', 'hsl(20, 55%, 22%)', 'hsl(250, 40%, 5%)'],
    ['hsl(225, 45%, 10%)', 'hsl(230, 45%, 5%)', 'hsl(240, 50%, 2%)'],
    ['hsl(200, 35%, 22%)', 'hsl(210, 30%, 12%)', 'hsl(220, 40%, 5%)'],
  ];

  DK.register({
    id: 'kraniche',
    name: 'Tausend Kraniche',
    sub: 'Senbazuru – gefaltete Wünsche',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const paper = DK.pick(PAPERS);
      const skyC = DK.pick(SKIES);
      const N = Math.round(34 * env.q + 14);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const L = [0.3, -0.5, -0.8]; // Lichtrichtung (von unten-seitlich)
      const ln = Math.hypot(...L);
      const light = L.map((v) => v / ln);
      const cranes = [];
      for (let i = 0; i < N; i++) {
        cranes.push({
          ring: DK.rand(0.12, 0.62), th: Math.random() * TAU, w: DK.rand(0.06, 0.12) * dir,
          alt: DK.rand(0.55, 1.2), flap: Math.random() * TAU, fr: DK.rand(2.2, 3.4), col: DK.pick(paper.cols), seed: Math.random() * 100,
        });
      }
      let sky = null;
      function buildSky() {
        sky = document.createElement('canvas');
        sky.width = env.w; sky.height = env.h;
        const g = sky.getContext('2d');
        const grd = g.createRadialGradient(env.w / 2, env.h / 2, 0, env.w / 2, env.h / 2, Math.max(env.w, env.h) * 0.75);
        grd.addColorStop(0, skyC[0]);
        grd.addColorStop(0.5, skyC[1]);
        grd.addColorStop(1, skyC[2]);
        g.fillStyle = grd;
        g.fillRect(0, 0, env.w, env.h);
        for (let i = 0; i < (env.w * env.h) / 8000; i++) {
          g.fillStyle = `rgba(230,230,255,${DK.rand(0.05, 0.35)})`;
          g.fillRect(Math.random() * env.w, Math.random() * env.h, 1.2, 1.2);
        }
      }
      buildSky();

      const tris = [];
      return {
        info: `${N} Kraniche · ${paper.n}`,
        resize() { buildSky(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          const p = env.pointer;
          tris.length = 0;
          for (const c of cranes) {
            c.th += c.w * dt * (1 + env.audio.level);
            c.flap += c.fr * dt * (1 + env.audio.bass);
            if (p.pulse) c.fr = DK.rand(4, 6);
            c.fr += (DK.rand(2.2, 3.4) - c.fr) * dt * 0.3;
            const wob = noise(c.seed, t * 0.1, 0);
            const R = (c.ring + wob * 0.05) * M;
            const cx = w / 2 + Math.cos(c.th) * R * (w / M) * 0.8;
            const cy = h / 2 + Math.sin(c.th) * R;
            // Flugrichtung = Tangente der Kreisbahn, leichte Schräglage in die Kurve
            const yaw = c.th + (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + wob * 0.3;
            const bank = 0.35 * dir;
            const size = M * 0.045 * c.alt;
            const flapZ = Math.sin(c.flap) * 0.7;
            const cyw = Math.cos(yaw), syw = Math.sin(yaw), cb = Math.cos(bank), sb = Math.sin(bank);
            for (const tri of MODEL) {
              const pts = tri.v.map(([x, y, z]) => {
                if (z === W) z = flapZ;
                // rollen (um x), dann gieren (um z)
                const y1 = y * cb - z * sb, z1 = y * sb + z * cb;
                return [x * cyw - y1 * syw, x * syw + y1 * cyw, z1];
              });
              const ax = pts[1][0] - pts[0][0], ay = pts[1][1] - pts[0][1], az = pts[1][2] - pts[0][2];
              const bx = pts[2][0] - pts[0][0], by = pts[2][1] - pts[0][1], bz = pts[2][2] - pts[0][2];
              let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
              const nl = Math.hypot(nx, ny, nz) || 1;
              const shade = 0.5 + 0.5 * Math.abs((nx * light[0] + ny * light[1] + nz * light[2]) / nl);
              const depth = c.alt * 10 - (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
              tris.push({ depth, pts: pts.map((q) => [cx + q[0] * size, cy + q[1] * size]), col: c.col, part: tri.c, shade });
            }
          }
          // von oben (fern) nach unten (nah) zeichnen
          tris.sort((a, b) => b.depth - a.depth);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sky, 0, 0);
          ctx.lineJoin = 'round';
          ctx.lineWidth = 0.8;
          for (const tr of tris) {
            const [hh, ss, ll] = tr.col;
            const l = ll * (tr.part === 1 ? 0.8 : 1) * tr.shade;
            ctx.fillStyle = DK.hsl(hh, ss, l);
            ctx.strokeStyle = DK.hsl(hh, ss, l * 0.75, 0.6);
            ctx.beginPath();
            ctx.moveTo(tr.pts[0][0], tr.pts[0][1]);
            ctx.lineTo(tr.pts[1][0], tr.pts[1][1]);
            ctx.lineTo(tr.pts[2][0], tr.pts[2][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        },
      };
    },
  });
})();
