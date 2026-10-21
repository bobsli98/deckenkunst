/* Synthwave: Neon-Gitter rast auf einen zu, darüber eine gestreifte Sonne und Bergsilhouetten */
(function () {
  'use strict';
  const PALS = [
    { n: 'Outrun', c1: [1.0, 0.25, 0.8], c2: [0.2, 0.9, 1.0], s1: [0.05, 0.0, 0.14], s2: [0.6, 0.1, 0.42], sa: [1.0, 0.9, 0.3], sb: [1.0, 0.2, 0.6] },
    { n: 'Sonnenuntergang', c1: [1.0, 0.4, 0.1], c2: [1.0, 0.2, 0.5], s1: [0.08, 0.0, 0.12], s2: [0.9, 0.3, 0.2], sa: [1.0, 0.95, 0.5], sb: [1.0, 0.3, 0.2] },
    { n: 'Vaporwave', c1: [0.3, 1.0, 0.8], c2: [1.0, 0.5, 0.9], s1: [0.1, 0.05, 0.25], s2: [0.5, 0.3, 0.7], sa: [1.0, 0.7, 0.9], sb: [0.6, 0.4, 1.0] },
  ];
  DK.shaderScene({
    id: 'synthwave',
    name: 'Synthwave',
    sub: '1986 hat angerufen',
    scale: 0.55,
    setup: () => {
      const p = DK.pick(PALS);
      return { u_c1: p.c1, u_c2: p.c2, u_s1: p.s1, u_s2: p.s2, u_sa: p.sa, u_sb: p.sb, u_speed: DK.rand(0.6, 1.1), u_flip: Math.random() < 0.5 ? 1 : 0 };
    },
    fs: `
uniform vec3 u_c1, u_c2, u_s1, u_s2, u_sa, u_sb;
uniform float u_speed;
uniform float u_flip;
void main() {
  vec2 uv = uvc();
  if (u_flip > 0.5) uv.y = -uv.y;
  float t = u_time;
  float hz = -0.08;
  vec3 col;
  if (uv.y > hz) {
    float k = uv.y - hz;
    col = mix(u_s2, u_s1, smoothstep(0.0, 0.6, k));
    col += vec3(0.8, 0.8, 1.0) * stars(uv, 60.0, t, u_seed) * smoothstep(0.15, 0.4, k);
    // Sonne mit Streifen, die nach unten breiter werden
    vec2 sc = vec2(0.0, hz + 0.25);
    float sr = 0.26;
    float d = length(uv - sc);
    float yy = (uv.y - sc.y) / sr;
    float sun = 1.0 - smoothstep(sr - 0.004, sr + 0.004, d);
    float band = fract(yy * 7.0 + t * 0.4);
    if (yy < 0.0 && band < -yy * 0.55) sun = 0.0;
    col = mix(col, mix(u_sb, u_sa, smoothstep(-1.0, 1.0, yy)), sun);
    col += u_sb * exp(-max(d - sr, 0.0) * 6.0) * 0.35 * (1.0 + u_audio.y);
    // Bergsilhouetten mit leuchtender Kante
    float m = hz + 0.02 + 0.11 * fbm(vec2(uv.x * 2.2 + u_seed, 1.0)) * (0.35 + abs(uv.x));
    if (uv.y < m) col = vec3(0.02, 0.0, 0.05) + u_c1 * 0.05;
    col += u_c2 * exp(-abs(uv.y - m) * 220.0) * 0.6;
  } else {
    // Bodengitter in Perspektive
    float depth = hz - uv.y;
    float z = 0.35 / depth;
    vec2 g = vec2(uv.x * z, z + t * u_speed * (1.0 + u_audio.y));
    vec2 fw = fwidth(g);
    vec2 dl = 0.5 - abs(fract(g) - 0.5);
    float line = max(1.0 - smoothstep(0.0, fw.x * 1.5, dl.x), 1.0 - smoothstep(0.0, fw.y * 1.5, dl.y));
    float fog = smoothstep(0.0, 0.25, depth);
    col = vec3(0.03, 0.0, 0.06) + u_c1 * line * fog * (1.2 + u_audio.y) + u_c2 * exp(-depth * 8.0) * 0.5;
  }
  outColor = vec4(tonemap(col * 1.2), 1.0);
}`,
  });
})();
