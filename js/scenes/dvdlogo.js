/* DVD-Logo: springt von Wand zu Wand und wechselt die Farbe – und trifft irgendwann tatsächlich die Ecke */
(function () {
  'use strict';
  const TAU = DK.TAU;

  function logoSprite() {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.font = 'italic 900 92px "Segoe UI", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('DECKE', 180, 62);
    g.beginPath();
    g.ellipse(180, 140, 160, 30, 0, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.font = '800 34px "Segoe UI", sans-serif';
    g.fillText('K U N S T', 180, 142);
    return c;
  }

  DK.register({
    id: 'dvdlogo',
    name: 'DVD-Logo',
    sub: 'Trifft es diesmal die Ecke?',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const logo = logoSprite();
      const tinted = document.createElement('canvas');
      tinted.width = logo.width; tinted.height = logo.height;
      const tg = tinted.getContext('2d');
      let hue = Math.random(), corners = 0, flash = 0, lastHit = { x: -9, y: -9 };
      const confetti = [];
      // Geschwindigkeiten so gewählt, dass die Bahn periodisch durch die Ecken läuft (alle q Querungen)
      const [p, q] = DK.pick([[3, 5], [4, 7], [5, 7], [5, 8]]);
      let lw, lh, x, y, vx, vy;

      function tint() {
        tg.clearRect(0, 0, tinted.width, tinted.height);
        tg.globalCompositeOperation = 'source-over';
        tg.drawImage(logo, 0, 0);
        tg.globalCompositeOperation = 'source-in';
        tg.fillStyle = DK.hsl(hue, 0.9, 0.6);
        tg.fillRect(0, 0, tinted.width, tinted.height);
      }

      function layout() {
        const M = Math.min(env.w, env.h);
        lw = M * 0.36; lh = lw / 2;
        const bw = env.w - lw, bh = env.h - lh;
        const T = DK.rand(6, 9); // Sekunden pro waagrechter Querung
        vx = bw / T; vy = (bh / T) * (p / q);
        // Start auf der Eckbahn, irgendwo unterwegs
        const s = Math.random() * T * q;
        const tri = (u, L) => { const m = u % (2 * L); return m < L ? m : 2 * L - m; };
        x = tri(vx * s, bw); y = tri(vy * s, bh);
        if (Math.floor((vx * s) / bw) % 2 === 1) vx = -vx;
        if (Math.floor((vy * s) / bh) % 2 === 1) vy = -vy;
      }
      layout();
      tint();

      return {
        get info() { return corners ? `Ecken getroffen: ${corners}` : 'Trifft es diesmal die Ecke?'; },
        resize() { layout(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          const bw = w - lw, bh = h - lh;
          const sp = 1 + env.audio.level * 0.5;
          x += vx * dt * sp; y += vy * dt * sp;
          let hx = false, hy = false;
          if (x <= 0) { x = -x; vx = Math.abs(vx); hx = true; } else if (x >= bw) { x = 2 * bw - x; vx = -Math.abs(vx); hx = true; }
          if (y <= 0) { y = -y; vy = Math.abs(vy); hy = true; } else if (y >= bh) { y = 2 * bh - y; vy = -Math.abs(vy); hy = true; }
          if (hx) lastHit.x = t;
          if (hy) lastHit.y = t;
          if (hx || hy) { hue = (hue + DK.rand(0.15, 0.45)) % 1; tint(); }
          // Ecke: beide Wände fast gleichzeitig berührt
          if ((hx || hy) && Math.abs(lastHit.x - lastHit.y) < 0.12) {
            corners++;
            flash = 1;
            lastHit.x = lastHit.y = -9;
            const cx = x < bw / 2 ? 0 : w, cy = y < bh / 2 ? 0 : h;
            for (let i = 0; i < 260; i++) {
              const a = Math.random() * TAU, s = M * DK.rand(0.1, 0.6);
              confetti.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: DK.rand(1.2, 2.6), age: 0, h: Math.random() });
            }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(tinted, x, y, lw, lh);

          ctx.globalCompositeOperation = 'lighter';
          for (let i = confetti.length - 1; i >= 0; i--) {
            const c = confetti[i];
            c.age += dt;
            if (c.age > c.life) { confetti.splice(i, 1); continue; }
            c.vx *= Math.pow(0.4, dt); c.vy *= Math.pow(0.4, dt);
            c.x += c.vx * dt; c.y += c.vy * dt;
            ctx.fillStyle = DK.hsl(c.h, 0.9, 0.6, 1 - c.age / c.life);
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
          }
          if (flash > 0) {
            flash -= dt * 0.4;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = Math.min(1, flash * 1.5);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.round(M * 0.12)}px "Segoe UI", sans-serif`;
            ctx.fillText('ECKE!', w / 2, h / 2);
            ctx.font = `300 ${Math.round(M * 0.03)}px "Segoe UI", sans-serif`;
            ctx.fillText(`${corners}. Treffer`, w / 2, h / 2 + M * 0.1);
            ctx.globalAlpha = 1;
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
