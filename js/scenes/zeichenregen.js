/* Zeichenregen: fallende Katakana-Kolonnen – mit Farbstimmungen von Grün bis Sakura */
(function () {
  'use strict';
  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789日月火水木金土空雨雪風';
  const MOODS = [
    { n: 'Klassisch', hue: 0.36, sat: 0.9 },
    { n: 'Sakura', hue: 0.93, sat: 0.6 },
    { n: 'Eis', hue: 0.55, sat: 0.7 },
    { n: 'Bernstein', hue: 0.1, sat: 0.9 },
    { n: 'Regenbogen', hue: -1, sat: 0.8 },
  ];

  DK.register({
    id: 'zeichenregen',
    name: 'Zeichenregen',
    sub: 'Daten, die vom Himmel fallen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const mood = DK.pick(MOODS);
      let cols = [], fs = 16, W = 0, H = 0;
      const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

      function build() {
        W = env.w; H = env.h;
        fs = Math.max(12, Math.round(Math.min(W, H) / 34));
        const n = Math.ceil(W / fs);
        cols = [];
        for (let i = 0; i < n; i++) {
          cols.push({ y: Math.random() * -H, sp: DK.rand(0.6, 1.5), trail: [], len: DK.randInt(10, 32), depth: DK.rand(0.45, 1), next: 0 });
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      build();

      return {
        info: mood.n,
        resize() { build(); },
        render(t, dt, env) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const speed = fs * 9 * (1 + env.audio.level * 1.5);
          const p = env.pointer;
          for (let i = 0; i < cols.length; i++) {
            const c = cols[i];
            c.y += speed * c.sp * dt;
            // pro Zelle ein Zeichen; neue Zeichen erscheinen am Kopf
            const row = Math.floor(c.y / fs);
            while (c.next <= row) {
              c.trail.push({ r: c.next, g: pick() });
              c.next++;
              if (c.trail.length > c.len) c.trail.shift();
            }
            if ((row - c.len) * fs > H) {
              c.y = DK.rand(-H * 0.5, 0); c.next = Math.floor(c.y / fs); c.trail = []; c.sp = DK.rand(0.6, 1.5); c.len = DK.randInt(10, 32);
            }
            const x = i * fs + fs / 2;
            const hue = mood.hue < 0 ? (i / cols.length + t * 0.02) % 1 : mood.hue + env.hue * 0.05;
            ctx.font = `${Math.round(fs * (0.75 + c.depth * 0.25))}px "MS Gothic", "Yu Gothic", monospace`;
            const n = c.trail.length;
            for (let k = 0; k < n; k++) {
              const e = c.trail[k];
              const y = e.r * fs;
              if (y < -fs || y > H) continue;
              if (Math.random() < 0.02) e.g = pick();
              const head = k === n - 1;
              const a = ((k + 1) / n) * c.depth;
              let near = 0;
              if (p.active > 0.3) near = Math.max(0, 1 - Math.hypot(x - p.nx * W, y - p.ny * H) / (fs * 6)) * p.active;
              ctx.fillStyle = head
                ? `rgba(235,255,240,${c.depth})`
                : DK.hsl(hue, mood.sat, 0.35 + a * 0.3 + near * 0.3, Math.min(1, a + near));
              ctx.fillText(e.g, x, y);
            }
          }
        },
      };
    },
  });
})();
