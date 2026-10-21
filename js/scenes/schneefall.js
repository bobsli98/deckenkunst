/* Schneefall: Blick nach oben in den fallenden Schnee – Flocken kommen aus der Tiefe auf einen zu */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const LIGHTS = [
    { n: 'Laternenlicht', sky: ['hsl(30, 25%, 9%)', 'hsl(230, 30%, 3%)'], flake: [1.0, 0.86, 0.7] },
    { n: 'Mondnacht', sky: ['hsl(215, 35%, 12%)', 'hsl(230, 40%, 3%)'], flake: [0.85, 0.92, 1.0] },
    { n: 'Dämmerung', sky: ['hsl(265, 25%, 14%)', 'hsl(220, 35%, 4%)'], flake: [0.95, 0.9, 1.0] },
  ];

  // sechsstrahliger Eiskristall für nahe Flocken
  let crystal = null;
  function crystalSprite() {
    if (crystal) return crystal;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i / 6) * TAU);
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -28); g.stroke();
      g.lineWidth = 1.6;
      for (const y of [-10, -18]) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(-6, y - 6); g.moveTo(0, y); g.lineTo(6, y - 6); g.stroke();
      }
      g.restore();
    }
    return (crystal = c);
  }

  DK.register({
    id: 'schneefall',
    name: 'Schneefall',
    sub: 'Leise, aus dem Dunkel',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const light = DK.pick(LIGHTS);
      const N = Math.round(700 * env.q + 200);
      const F = [];
      const spawn = (f, far) => {
        f.x = DK.rand(-1.2, 1.2); f.y = DK.rand(-1.2, 1.2);
        f.z = far ? DK.rand(2.5, 4) : DK.rand(0.15, 4);
        f.ph = Math.random() * TAU; f.rot = Math.random() * TAU; f.vr = DK.rand(-1, 1);
        f.kind = Math.random() < 0.12 ? 1 : 0;
        return f;
      };
      for (let i = 0; i < N; i++) F.push(spawn({}, false));
      let bg = null;
      function buildBg() {
        bg = document.createElement('canvas');
        bg.width = env.w; bg.height = env.h;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(env.w / 2, env.h / 2, 0, env.w / 2, env.h / 2, Math.max(env.w, env.h) * 0.75);
        grd.addColorStop(0, light.sky[0]);
        grd.addColorStop(1, light.sky[1]);
        g.fillStyle = grd;
        g.fillRect(0, 0, env.w, env.h);
      }
      buildBg();
      const [fr, fg, fb] = light.flake;

      return {
        info: light.n,
        resize() { buildBg(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          // Wind verschiebt den Fluchtpunkt; Böen beschleunigen alles
          const gust = 0.6 + 0.6 * Math.max(0, noise(t * 0.05, 3, 1)) + env.audio.level;
          const wx = noise(t * 0.03, 0, 0) * 0.35, wy = noise(t * 0.03, 9, 0) * 0.35;
          const speed = 0.35 * gust;
          const p = env.pointer;

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';

          F.sort((a, b) => b.z - a.z);
          const soft = DK.glowSprite(0.1, 0.1, 0.75, 64);
          for (const f of F) {
            f.z -= speed * dt;
            f.ph += dt;
            // seitliches Taumeln
            f.x += (Math.sin(f.ph * 1.3) * 0.03 + wx * 0.1) * dt;
            f.y += (Math.cos(f.ph * 0.9) * 0.03 + wy * 0.1) * dt;
            if (p.pulse) { f.x += (f.x - (p.nx - 0.5) * 2) * 0.3 / f.z; }
            if (f.z < 0.12) { spawn(f, true); continue; }
            const sx = w / 2 + (f.x / f.z) * M * 0.6, sy = h / 2 + (f.y / f.z) * M * 0.6;
            const s = (M * 0.02) / f.z;
            if (sx < -s || sy < -s || sx > w + s || sy > h + s) { spawn(f, true); continue; }
            // nah = gross, unscharf, durchsichtig; fern = klein und dunstig
            const near = DK.clamp(1 - (f.z - 0.12) / 0.6, 0, 1);
            const far = DK.clamp((f.z - 1.5) / 2.5, 0, 1);
            const a = (1 - far * 0.75) * (1 - near * 0.6) * Math.min(1, (4 - f.z) * 2);
            ctx.globalAlpha = a * 0.85;
            if (f.kind && f.z < 1.2) {
              f.rot += f.vr * dt;
              ctx.setTransform(Math.cos(f.rot), Math.sin(f.rot), -Math.sin(f.rot), Math.cos(f.rot), sx, sy);
              ctx.drawImage(crystalSprite(), -s, -s, s * 2, s * 2);
              ctx.setTransform(1, 0, 0, 1, 0, 0);
            } else {
              const ss = s * (1.6 + near * 2.5);
              ctx.drawImage(soft, sx - ss / 2, sy - ss / 2, ss, ss);
            }
          }
          ctx.globalAlpha = 1;
          // warmer Schein des Lichts
          ctx.globalAlpha = 0.18;
          const ls = M * 1.2;
          ctx.drawImage(DK.glowSprite(light.n === 'Laternenlicht' ? 0.09 : 0.6, 0.5, 0.5, 128), w / 2 - ls / 2, h / 2 - ls / 2, ls, ls);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          // Flockenfarbe als zarter Farbstich
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgb(${Math.round(fr * 255)},${Math.round(fg * 255)},${Math.round(fb * 255)})`;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
