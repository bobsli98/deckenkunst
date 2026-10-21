/* Lavalampe: verschmelzende Wachsblasen (Metaballs) – ein sehr genügsamer Shader */
(function () {
  'use strict';
  const PALS = [
    { n: 'Klassisch', c1: [1.0, 0.45, 0.12], c2: [0.85, 0.08, 0.2], bg: [0.08, 0.01, 0.03] },
    { n: 'Ozean', c1: [0.2, 0.85, 1.0], c2: [0.25, 0.2, 0.9], bg: [0.0, 0.02, 0.07] },
    { n: 'Gift', c1: [0.75, 1.0, 0.2], c2: [0.1, 0.6, 0.35], bg: [0.0, 0.05, 0.03] },
    { n: 'Flamingo', c1: [1.0, 0.6, 0.8], c2: [0.7, 0.15, 0.75], bg: [0.06, 0.0, 0.07] },
  ];
  DK.shaderScene({
    id: 'lavalampe',
    name: 'Lavalampe',
    sub: 'Wachs, das nie zur Ruhe kommt',
    scale: 0.45,
    setup: () => {
      const p = DK.pick(PALS);
      return { u_n: DK.randInt(6, 10), u_c1: p.c1, u_c2: p.c2, u_bg: p.bg, u_size: DK.rand(0.8, 1.3) };
    },
    fs: `
uniform float u_n;
uniform vec3 u_c1, u_c2, u_bg;
uniform float u_size;
void main() {
  vec2 uv = uvc();
  vec2 half_ = 0.5 * u_res / min(u_res.x, u_res.y);
  float t = u_time * 0.15 * (1.0 + u_audio.x * 0.6);
  float f = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= u_n) break;
    vec2 h = hash22(vec2(fi * 7.3, u_seed));
    vec2 c = half_ * 0.85 * vec2(sin(t * (0.5 + h.x * 0.7) + h.y * 6.3), sin(t * (0.35 + h.y * 0.6) * 1.3 + h.x * 6.3));
    float r = (0.07 + 0.08 * h.x) * u_size * (1.0 + 0.15 * sin(t * 2.0 + fi));
    vec2 d = uv - c;
    f += r * r / max(dot(d, d), 1e-4);
  }
  vec2 dp = uv - pointerUV();
  f += u_pointerActive * 0.012 / max(dot(dp, dp), 1e-4);
  f = min(f, 12.0);
  float fw = min(fwidth(f) * 1.5, 0.3) + 1e-3;
  float inside = smoothstep(1.0 - fw, 1.0 + fw, f);
  vec3 wax = mix(u_c2, u_c1, smoothstep(1.0, 6.0, f));
  float rim = smoothstep(1.0, 1.25, f) - smoothstep(1.25, 2.0, f);
  vec3 col = u_bg * (1.0 - 0.4 * dot(uv, uv));
  col += u_c2 * smoothstep(0.25, 1.0, f) * 0.25;
  col = mix(col, wax * (0.75 + 0.25 * rim) + vec3(1.0, 0.9, 0.8) * pow(max(0.0, 1.0 - abs(f - 1.6)), 6.0) * 0.25, inside);
  outColor = vec4(col, 1.0);
}`,
  });
})();
