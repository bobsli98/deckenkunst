/* Sternennebel: mehrfach verzerrtes Rauschen (Domain Warping) mit Kosinus-Paletten */
(function () {
  'use strict';
  const PALS = [
    [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0.33, 0.67]],
    [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0.1, 0.2]],
    [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 0.5], [0.8, 0.9, 0.3]],
    [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [2, 1, 0], [0.5, 0.2, 0.25]],
    [[0.8, 0.5, 0.4], [0.2, 0.4, 0.2], [2, 1, 1], [0, 0.25, 0.25]],
  ];
  DK.shaderScene({
    id: 'nebel',
    name: 'Sternennebel',
    sub: 'Staub, aus dem Sonnen werden',
    scale: 0.55,
    setup: () => {
      const p = DK.pick(PALS);
      return { u_pa: p[0], u_pb: p[1], u_pc: p[2], u_pd: p[3], u_warp: DK.rand(3, 4.5), u_zoom: DK.rand(1.2, 2.2) };
    },
    fs: `
uniform vec3 u_pa, u_pb, u_pc, u_pd;
uniform float u_warp;
uniform float u_zoom;
void main() {
  vec2 uv = uvc();
  float t = u_time * 0.035;
  vec2 p = rot(t * 0.4) * uv * u_zoom;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2) + 0.45 * t), fbm(p + u_warp * q + vec2(8.3, 2.8) - 0.38 * t));
  float f = fbm(p + u_warp * r);
  float dens = smoothstep(0.5, 0.92, f);
  vec3 col = pal(f * 1.1 + length(q) * 0.5 + u_hue, u_pa, u_pb, u_pc, u_pd);
  col *= dens * dens * (1.4 + 0.4 * length(r)) * (1.0 + u_audio.y * 0.7);
  col += pal(r.x + u_hue + 0.5, u_pa, u_pb, u_pc, u_pd) * pow(max(r.y - 0.55, 0.0), 2.0) * 2.0 * dens;
  col += vec3(0.85, 0.9, 1.0) * stars(uv, 70.0, u_time, u_seed) * (1.0 - dens);
  outColor = vec4(tonemap(col * 1.2), 1.0);
}`,
  });
})();
