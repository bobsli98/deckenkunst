/* Glasdach im Regen: Tropfen als kleine Linsen, die den Himmel kopfüber spiegeln, zusammenwachsen und abrinnen */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const MOODS = [
    { n: 'Nieselregen', rate: 25, big: 0.25, storm: false, top: 'hsl(220, 25%, 16%)', bottom: 'hsl(230, 30%, 5%)' },
    { n: 'Landregen', rate: 55, big: 0.45, storm: false, top: 'hsl(210, 30%, 14%)', bottom: 'hsl(225, 35%, 4%)' },
    { n: 'Gewitter', rate: 90, big: 0.6, storm: true, top: 'hsl(250, 25%, 12%)', bottom: 'hsl(260, 30%, 3%)' },
    { n: 'Abendregen', rate: 45, big: 0.4, storm: false, top: 'hsl(20, 35%, 16%)', bottom: 'hsl(250, 30%, 5%)' },
  ];

  let shade = null;
  function dropShade() {
    if (shade) return shade;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    // dunkler Rand unten, Glanzpunkt oben links
    const rim = g.createRadialGradient(32, 26, 18, 32, 32, 32);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.85, 'rgba(0,0,0,0.25)');
    rim.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = rim;
    g.beginPath(); g.arc(32, 32, 31, 0, TAU); g.fill();
    const hi = g.createRadialGradient(22, 20, 0, 22, 20, 12);
    hi.addColorStop(0, 'rgba(255,255,255,0.85)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.beginPath(); g.arc(22, 20, 12, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(32, 32, 29, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    return (shade = c);
  }

  DK.register({
    id: 'glasdach',
    name: 'Glasdach im Regen',
    sub: 'Drinnen trocken, draussen die Welt',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const mood = DK.pick(MOODS);
      let bg, bgSharp, mist, mctx, W, H, S;
      const drops = [];
      let flash = 0, nextFlash = DK.rand(6, 14), flashes = 0;
      const maxDrops = Math.round(110 * env.q + 40);

      function build() {
        W = env.w; H = env.h; S = Math.min(W, H) / 140;
        // Was hinter dem Glas liegt: Wolkenhimmel, Äste, ein paar warme Lichter
        bgSharp = document.createElement('canvas');
        bgSharp.width = W; bgSharp.height = H;
        const g = bgSharp.getContext('2d');
        const grd = g.createLinearGradient(0, 0, W * 0.3, H);
        grd.addColorStop(0, mood.top);
        grd.addColorStop(1, mood.bottom);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 14; i++) {
          const s = Math.min(W, H) * DK.rand(0.3, 0.7);
          g.globalAlpha = 0.08;
          g.drawImage(DK.glowSprite(DK.rand(0.55, 0.7), 0.15, 0.5, 128), Math.random() * W - s / 2, Math.random() * H - s / 2, s * 1.6, s);
        }
        for (let i = 0; i < 7; i++) {
          const s = Math.min(W, H) * DK.rand(0.05, 0.14);
          g.globalAlpha = DK.rand(0.35, 0.8);
          g.drawImage(DK.glowSprite(DK.rand(0.06, 0.12), 0.9, 0.55, 128), Math.random() * W - s / 2, Math.random() * H - s / 2, s, s);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(3,3,6,0.9)';
        g.lineCap = 'round';
        const bS = S * 0.4;
        const branch = (x, y, a, len, wd, d) => {
          const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
          g.lineWidth = wd;
          g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
          if (d > 6 || wd < 1) return;
          for (let k = 0; k < 2; k++) branch(ex, ey, a + DK.rand(-0.6, 0.6), len * DK.rand(0.65, 0.8), wd * 0.68, d + 1);
        };
        const nb = DK.randInt(1, 3);
        for (let i = 0; i < nb; i++) {
          const a = Math.random() * TAU;
          branch(W / 2 + Math.cos(a) * W * 0.6, H / 2 + Math.sin(a) * H * 0.6, a + Math.PI + DK.rand(-0.4, 0.4), Math.min(W, H) * 0.25, 22 * bS, 0);
        }
        // unscharfe Version für den Hintergrund
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const b = bg.getContext('2d');
        b.filter = `blur(${Math.round(6 * S)}px)`;
        b.drawImage(bgSharp, 0, 0);
        b.filter = 'none';
        // feiner Beschlag aus winzigen Tröpfchen
        mist = document.createElement('canvas');
        mist.width = W; mist.height = H;
        mctx = mist.getContext('2d');
        sprinkle(Math.round((W * H) / 900));
      }

      function sprinkle(n) {
        mctx.fillStyle = 'rgba(200,215,235,0.12)';
        for (let i = 0; i < n; i++) {
          mctx.beginPath();
          mctx.arc(Math.random() * W, Math.random() * H, DK.rand(0.06, 0.18) * S, 0, TAU);
          mctx.fill();
        }
      }

      function addDrop(x, y, r) {
        for (const d of drops) {
          const dx = d.x - x, dy = d.y - y;
          if (dx * dx + dy * dy < (d.r + r) * (d.r + r) * 0.6) {
            d.r = Math.cbrt(d.r * d.r * d.r + r * r * r);
            return;
          }
        }
        if (drops.length < maxDrops) drops.push({ x, y, r, vy: 0, slide: false, trail: 0, wob: Math.random() * 10 });
      }

      build();
      for (let i = 0; i < maxDrops * 0.6; i++) addDrop(Math.random() * W, Math.random() * H, DK.rand(0.8, 3.5) * S);

      return {
        info: mood.n,
        resize() { build(); drops.length = 0; },
        render(t, dt, env) {
          const p = env.pointer;
          // Neue Tropfen
          const rate = mood.rate * 0.35 * (1 + env.audio.level * 2);
          let k = rate * dt;
          while (k > 0) {
            if (Math.random() < k) addDrop(Math.random() * W, Math.random() * H, (Math.random() < mood.big ? DK.rand(2, 4) : DK.rand(0.6, 1.8)) * S);
            k -= 1;
          }
          if (p.active > 0.6) addDrop(p.nx * W + DK.rand(-1, 1) * 8 * S, p.ny * H + DK.rand(-1, 1) * 8 * S, DK.rand(1.5, 3) * S);
          if (Math.random() < dt * 0.5) sprinkle(20);

          // Tropfen ab einer gewissen Grösse rinnen ruckartig ab
          const slideR = 5.5 * S;
          mctx.globalCompositeOperation = 'destination-out';
          for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            if (!d.slide && d.r > slideR && Math.random() < dt * 2) d.slide = true;
            if (!d.slide) continue;
            d.vy += (Math.random() < 0.15 ? DK.rand(15, 60) : -15) * S * dt;
            d.vy = DK.clamp(d.vy, 2 * S, 60 * S);
            const oy = d.y;
            d.y += d.vy * dt;
            d.x += Math.sin(t * 2 + d.wob) * 2 * S * dt;
            d.r -= 0.1 * S * dt;
            // Spur wischt den Beschlag weg und hinterlässt Perlen
            mctx.lineWidth = d.r * 1.4;
            mctx.beginPath(); mctx.moveTo(d.x, oy); mctx.lineTo(d.x, d.y); mctx.stroke();
            d.trail += d.y - oy;
            if (d.trail > d.r * 2.5) { d.trail = 0; if (drops.length < maxDrops) drops.push({ x: d.x + DK.rand(-1, 1) * S, y: d.y - d.r * 1.5, r: d.r * DK.rand(0.15, 0.3), vy: 0, slide: false, trail: 0, wob: 0 }); }
            for (let j = drops.length - 1; j >= 0; j--) {
              const e = drops[j];
              if (e === d) continue;
              const dx = e.x - d.x, dy = e.y - d.y;
              if (dx * dx + dy * dy < (d.r + e.r) * (d.r + e.r) * 0.5) {
                d.r = Math.cbrt(d.r * d.r * d.r + e.r * e.r * e.r);
                drops.splice(j, 1);
                if (j < i) i--;
              }
            }
            if (d.y - d.r > H || d.r < 1) drops.splice(drops.indexOf(d), 1);
          }
          mctx.globalCompositeOperation = 'source-over';

          // Blitz
          if (mood.storm) {
            nextFlash -= dt;
            if (nextFlash < 0) { flash = 1; flashes = DK.randInt(1, 3); nextFlash = DK.rand(7, 18); }
          }
          if (p.pulse) { flash = 0.8; flashes = 1; }
          if (flash > 0) {
            flash -= dt * 3;
            if (flash <= 0 && flashes > 1) { flashes--; flash = DK.rand(0.5, 1); }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.drawImage(mist, 0, 0);

          // Linsen: Ausschnitt des scharfen Hintergrunds, kopfüber und verkleinert
          const sh = dropShade();
          for (const d of drops) {
            const r = d.r;
            if (r < 1.3 * S) {
              ctx.globalAlpha = 0.5;
              ctx.drawImage(sh, d.x - r, d.y - r, r * 2, r * 2);
              continue;
            }
            const ry = r * (d.slide ? 1.15 : 1);
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(d.x, d.y, r, ry, 0, 0, TAU);
            ctx.clip();
            ctx.globalAlpha = 1;
            ctx.translate(d.x, d.y);
            ctx.scale(1, -1);
            const span = r * 9;
            ctx.drawImage(bgSharp, d.x - span / 2, d.y - span / 2, span, span, -r, -ry, r * 2, ry * 2);
            ctx.restore();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(sh, d.x - r, d.y - ry, r * 2, ry * 2);
          }
          ctx.globalAlpha = 1;

          if (flash > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(190,200,255,${(Math.max(0, flash) * 0.45).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
          }
        },
      };
    },
  });
})();
