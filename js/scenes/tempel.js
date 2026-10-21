/* Tempel im Regen: unter dem geschwungenen Vordach liegen – Sparren, Traufe, tropfendes Wasser, eine Laterne */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const MOODS = [
    { n: 'Sommerregen', sky: ['hsl(205, 18%, 46%)', 'hsl(215, 22%, 22%)'], wood: [22, 35, 14], tips: '#e9dcb4', leaves: false, mist: 0.25, light: 0.55 },
    { n: 'Herbstregen', sky: ['hsl(30, 15%, 40%)', 'hsl(220, 18%, 18%)'], wood: [12, 45, 13], tips: '#f1e4c0', leaves: true, mist: 0.2, light: 0.6 },
    { n: 'Abendregen', sky: ['hsl(225, 25%, 24%)', 'hsl(235, 30%, 8%)'], wood: [15, 30, 9], tips: '#d9c99a', leaves: false, mist: 0.12, light: 0.9 },
    { n: 'Nebelregen', sky: ['hsl(200, 10%, 58%)', 'hsl(205, 12%, 32%)'], wood: [25, 25, 16], tips: '#efe8d0', leaves: false, mist: 0.45, light: 0.45 },
  ];

  DK.register({
    id: 'tempel',
    name: 'Tempel im Regen',
    sub: 'Unter dem Vordach, wo es trocken ist',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const mood = DK.pick(MOODS);
      const rot = DK.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + DK.rand(-0.25, 0.25);
      let layer, W, H, D, M, Z, edge, rain = [], drips = [], leaves = [];
      let lantern, chime;

      // lokales Bild: Traufe läuft quer, das Dach liegt oben (y < Traufe)
      const toScreen = (x, y) => {
        const c = Math.cos(rot), s = Math.sin(rot);
        const lx = x - D / 2, ly = y - D / 2;
        return [W / 2 + lx * c - ly * s, H / 2 + lx * s + ly * c];
      };
      // Höhe der Traufe an der Stelle x: in der Mitte gerade, an den Enden elegant nach aussen geschwungen
      const eaveY = (x) => {
        const u = (x - D / 2) / (D / 2);
        return D * 0.5 + M * 0.06 + Math.pow(Math.abs(u), 3.2) * M * 0.22;
      };

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        D = Math.ceil(Math.hypot(W, H));
        layer = document.createElement('canvas');
        layer.width = W; layer.height = H;
        const g = layer.getContext('2d');
        g.setTransform(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), W / 2, H / 2);
        g.translate(-D / 2, -D / 2);

        // Regenhimmel
        const sky = g.createLinearGradient(0, D, 0, D * 0.4);
        sky.addColorStop(0, mood.sky[1]);
        sky.addColorStop(1, mood.sky[0]);
        g.fillStyle = sky;
        g.fillRect(0, 0, D, D);
        // ferne Kiefernzweige im Dunst
        g.globalAlpha = 0.35;
        g.strokeStyle = 'rgba(25,35,30,0.9)';
        g.lineCap = 'round';
        for (let b = 0; b < 3; b++) {
          let x = DK.rand(0.1, 0.9) * D, y = D;
          g.lineWidth = M * 0.012;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 6; k++) { x += DK.rand(-0.05, 0.05) * D; y -= DK.rand(0.03, 0.06) * D; g.lineTo(x, y); }
          g.stroke();
          for (let k = 0; k < 14; k++) {
            g.fillStyle = 'rgba(20,32,26,0.8)';
            g.beginPath(); g.ellipse(x + DK.rand(-0.1, 0.1) * D, y + DK.rand(0, 0.25) * D, M * DK.rand(0.03, 0.07), M * DK.rand(0.015, 0.03), DK.rand(-0.4, 0.4), 0, TAU); g.fill();
          }
        }
        g.globalAlpha = 1;

        // Dachuntersicht: Fläche oberhalb der geschwungenen Traufe
        const [h, s, l] = mood.wood;
        const roof = new Path2D();
        roof.moveTo(0, 0);
        roof.lineTo(D, 0);
        for (let x = D; x >= 0; x -= D / 80) roof.lineTo(x, eaveY(x));
        roof.closePath();
        g.fillStyle = `hsl(${h}, ${s}%, ${l * 0.5}%)`;
        g.fill(roof);
        g.save();
        g.clip(roof);
        // Pfetten (Querbalken) parallel zur Traufe
        for (let k = 1; k <= 3; k++) {
          g.strokeStyle = `hsla(${h}, ${s}%, ${l * 0.35}%, 0.9)`;
          g.lineWidth = M * 0.02;
          g.beginPath();
          for (let x = 0; x <= D; x += D / 60) {
            const y = eaveY(x) - M * (0.1 + k * 0.13);
            x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        // Sparren (Taruki): dicht nebeneinander, senkrecht zur Traufe, mit hell bemalten Stirnseiten
        const spacing = M * 0.038;
        for (let x = spacing / 2; x < D; x += spacing) {
          const y1 = eaveY(x);
          const dx = (eaveY(x + 1) - eaveY(x - 1)) / 2;
          const nx = -dx / Math.hypot(dx, 1), ny = 1 / Math.hypot(dx, 1);
          const wd = spacing * 0.55;
          const grd = g.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
          grd.addColorStop(0, `hsl(${h}, ${s}%, ${l * 0.7}%)`);
          grd.addColorStop(0.5, `hsl(${h}, ${s}%, ${l * 1.3}%)`);
          grd.addColorStop(1, `hsl(${h}, ${s}%, ${l * 0.6}%)`);
          g.strokeStyle = grd;
          g.lineWidth = wd;
          g.beginPath();
          g.moveTo(x - nx * M * 0.9, y1 - ny * M * 0.9);
          g.lineTo(x - nx * wd * 0.5, y1 - ny * wd * 0.5);
          g.stroke();
          g.fillStyle = mood.tips;
          g.save();
          g.translate(x, y1);
          g.rotate(Math.atan2(ny, nx) - Math.PI / 2);
          g.fillRect(-wd / 2, -wd * 0.9, wd, wd * 0.9);
          g.restore();
        }
        // Tiefe: weiter unter dem Dach wird es dunkler, die Laterne hellt ihre Umgebung warm auf
        const shade = g.createLinearGradient(0, D * 0.5, 0, D * 0.5 - M * 0.8);
        shade.addColorStop(0, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.75)');
        g.fillStyle = shade;
        g.fillRect(0, 0, D, D);
        g.restore();
        // Traufbrett und Kupferkante mit Grünspan
        g.lineCap = 'butt';
        for (const [off, lw, col] of [[M * 0.012, M * 0.018, `hsl(${h}, ${s}%, ${l * 0.45}%)`], [M * 0.026, M * 0.012, 'hsl(160, 30%, 38%)'], [M * 0.032, M * 0.003, 'rgba(220,240,235,0.5)']]) {
          g.strokeStyle = col;
          g.lineWidth = lw;
          g.beginPath();
          for (let x = 0; x <= D; x += D / 80) {
            const y = eaveY(x) + off;
            x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        // Tropfstellen entlang der Kante
        edge = [];
        for (let x = spacing; x < D; x += spacing * DK.rand(1, 2.5)) edge.push({ x, y: eaveY(x) + M * 0.034, t: Math.random() * 3, ph: Math.random() });

        // Fluchtpunkt (Zenit) liegt unter dem Dach, knapp hinter der Kante
        const zx = D / 2 + DK.rand(-0.15, 0.15) * M;
        Z = { x: zx, y: eaveY(zx) - M * 0.18 };
        const lx = D / 2 + DK.rand(-0.3, 0.3) * M;
        lantern = { x: lx, y: eaveY(lx) - M * 0.1, r: M * 0.075, ph: Math.random() * TAU };
        const cx = lx + (Math.random() < 0.5 ? -1 : 1) * M * DK.rand(0.22, 0.35);
        chime = { x: cx, y: eaveY(cx) - M * 0.04, ph: Math.random() * TAU };
        rain = []; drips = []; leaves = [];
      }
      build();

      // Laterne von unten: roter Papierball mit Rippen und dunkler Bodenkappe
      function drawLantern(g, L, t, glow) {
        const sx = Math.sin(t * 0.9 + L.ph) * M * 0.008, sy = Math.cos(t * 0.7 + L.ph) * M * 0.006;
        const [x, y] = [L.x + sx, L.y + sy];
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35 * glow;
        const gs = L.r * 7;
        g.drawImage(DK.glowSprite(0.05, 0.9, 0.55, 128), x - gs / 2, y - gs / 2, gs, gs);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        const grd = g.createRadialGradient(x, y, L.r * 0.2, x, y, L.r);
        grd.addColorStop(0, '#ffd49a');
        grd.addColorStop(0.55, '#e0452c');
        grd.addColorStop(1, '#8a1d14');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, L.r, 0, TAU); g.fill();
        // feine Bambusrippen im Papier, dazu senkrechte Falten
        g.strokeStyle = 'rgba(120,30,15,0.18)';
        g.lineWidth = Math.max(1, L.r * 0.02);
        for (let k = 1; k < 7; k++) { g.beginPath(); g.arc(x, y, L.r * (0.3 + k * 0.1), 0, TAU); g.stroke(); }
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          g.beginPath(); g.moveTo(x + Math.cos(a) * L.r * 0.3, y + Math.sin(a) * L.r * 0.3); g.lineTo(x + Math.cos(a) * L.r, y + Math.sin(a) * L.r); g.stroke();
        }
        // Bodenring aus Holz mit dem Kerzenschein dahinter
        g.fillStyle = '#2a160c';
        g.beginPath(); g.arc(x, y, L.r * 0.26, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,200,120,0.85)';
        g.beginPath(); g.arc(x, y, L.r * 0.14, 0, TAU); g.fill();
      }

      function drawChime(g, Ch, t, wind) {
        const a = Math.sin(t * 1.8 + Ch.ph) * 0.4 * wind;
        const x = Ch.x + Math.sin(a) * M * 0.02, y = Ch.y + Math.cos(a) * M * 0.004;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.25;
        const gs = M * 0.06;
        g.drawImage(DK.glowSprite(0.55, 0.5, 0.7, 64), x - gs / 2, y - gs / 2, gs, gs);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.85;
        g.fillStyle = 'rgba(190,225,235,0.55)';
        g.beginPath(); g.arc(x, y, M * 0.017, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(240,250,255,0.8)';
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = 'rgba(210,60,60,0.8)';
        g.beginPath(); g.arc(x - M * 0.005, y - M * 0.005, M * 0.004, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }

      return {
        info: mood.n,
        resize() { build(); },
        render(t, dt, env) {
          const wind = 0.6 + Math.max(0, noise(t * 0.08, 1, 0)) * 1.2 + env.audio.level;
          const intensity = 0.7 + 0.3 * Math.sin(t * 0.05) + env.audio.level * 0.5;

          // Regen von jenseits der Traufe: strebt vom Zenit weg und wird grösser
          const target = Math.round((160 * env.q + 60) * intensity);
          while (rain.length < target) {
            const a = Math.random() * TAU;
            rain.push({ a, r: DK.rand(0.05, 0.4) * M, v: DK.rand(1.2, 2.2) });
          }
          // Tropfen lösen sich von der Kante
          for (const e of edge) {
            e.t -= dt * intensity;
            if (e.t < 0) {
              e.t = DK.rand(0.4, 2.2);
              drips.push({ x: e.x, y: e.y, s: 0, age: 0 });
            }
          }
          if (mood.leaves && Math.random() < dt * 0.4) {
            const a = Math.random() * TAU;
            leaves.push({ a, r: M * DK.rand(0.1, 0.3), rot: Math.random() * TAU, vr: DK.rand(-2, 2), h: DK.rand(0.0, 0.08), age: 0 });
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(layer, 0, 0);

          // Regen und Tropfen im lokalen Bild zeichnen
          ctx.setTransform(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), W / 2, H / 2);
          ctx.translate(-D / 2, -D / 2);
          const path = new Path2D();
          for (let i = rain.length - 1; i >= 0; i--) {
            const d = rain[i];
            const r0 = d.r;
            d.r *= 1 + d.v * dt;
            const x1 = Z.x + Math.cos(d.a) * d.r, y1 = Z.y + Math.sin(d.a) * d.r;
            if (d.r > D) { rain.splice(i, 1); continue; }
            // nur sichtbar, wo kein Dach darüber ist
            if (y1 < eaveY(x1) + M * 0.03) continue;
            path.moveTo(Z.x + Math.cos(d.a) * r0, Z.y + Math.sin(d.a) * r0);
            path.lineTo(x1, y1);
          }
          ctx.strokeStyle = 'rgba(225,235,245,0.42)';
          ctx.lineWidth = Math.max(1.2, M * 0.0024);
          ctx.lineCap = 'round';
          ctx.stroke(path);

          ctx.fillStyle = 'rgba(215,230,240,0.55)';
          for (let i = drips.length - 1; i >= 0; i--) {
            const d = drips[i];
            d.age += dt;
            // Tropfen fallen dem Betrachter entgegen: vom Zenit weg, immer schneller und grösser
            const vx = d.x - Z.x, vy = d.y - Z.y;
            const f = 1 + dt * (0.6 + d.age * 2.5);
            d.x = Z.x + vx * f; d.y = Z.y + vy * f;
            const r = M * (0.003 + d.age * 0.006);
            if (d.age > 2.5 || d.x < -50 || d.y > D + 50) { drips.splice(i, 1); continue; }
            ctx.beginPath(); ctx.ellipse(d.x, d.y, r, r * (1 + d.age), Math.atan2(vy, vx) + Math.PI / 2, 0, TAU); ctx.fill();
          }

          for (let i = leaves.length - 1; i >= 0; i--) {
            const L = leaves[i];
            L.age += dt;
            L.r *= 1 + dt * 0.35;
            L.rot += L.vr * dt;
            const x = Z.x + Math.cos(L.a) * L.r, y = Z.y + Math.sin(L.a) * L.r;
            if (L.age > 9 || L.r > D) { leaves.splice(i, 1); continue; }
            if (y < eaveY(x)) continue;
            const s = M * 0.011 * (1 + L.age * 0.35);
            ctx.save();
            ctx.translate(x, y); ctx.rotate(L.rot); ctx.scale(Math.cos(L.age * 2.5), 1);
            ctx.fillStyle = DK.hsl(L.h, 0.85, 0.42, Math.min(1, L.age));
            ctx.beginPath();
            for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, rr = k % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }

          // Laterne und Windglöckchen hängen unter dem Dach
          drawLantern(ctx, lantern, t, mood.light * (0.9 + 0.1 * Math.sin(t * 7 + lantern.ph)));
          drawChime(ctx, chime, t, wind);

          // feuchter Dunst
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = mood.mist * (0.8 + 0.2 * Math.sin(t * 0.1));
          ctx.globalCompositeOperation = 'lighter';
          const ms = Math.max(W, H) * 1.2;
          ctx.drawImage(DK.glowSprite(0.58, 0.1, 0.35, 128), W / 2 - ms / 2, H / 2 - ms / 2, ms, ms);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
