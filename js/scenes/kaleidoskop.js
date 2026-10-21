/* Kaleidoskop: gespiegelte Sektoren über einem „Kaliset“-Fraktal */
DK.shaderScene({
  id: 'kaleidoskop',
  name: 'Kaleidoskop',
  sub: 'Symmetrie, die atmet',
  scale: 0.6,
  setup: () => ({
    u_seg: DK.pick([5, 6, 7, 8, 9, 10, 12]),
    u_zoom: DK.rand(0.9, 1.6),
    u_sharp: DK.rand(10, 26),
    u_cbase: [DK.rand(0.55, 0.9), DK.rand(0.45, 0.8)],
  }),
  fs: `
uniform float u_seg;
uniform float u_zoom;
uniform float u_sharp;
uniform vec2 u_cbase;
void main() {
  vec2 uv = uvc();
  float t = u_time;
  float r = length(uv);
  float a = atan(uv.y, uv.x) + t * 0.02;
  float seg = TAU / u_seg;
  a = mod(a, seg);
  a = abs(a - 0.5 * seg);
  vec2 p = vec2(cos(a), sin(a)) * r;
  p *= u_zoom * (1.0 + 0.2 * sin(t * 0.05)) * (1.0 - 0.12 * u_audio.y);
  p = rot(t * 0.013) * p + vec2(0.15 * sin(t * 0.031), 0.15 * cos(t * 0.027));
  vec2 c = u_cbase + 0.12 * vec2(sin(t * 0.037), cos(t * 0.029));
  vec3 col = vec3(0.0);
  vec2 z = p;
  for (int i = 0; i < 9; i++) {
    z = abs(z) / max(dot(z, z), 0.02) - c;
    float l = length(z);
    float w = exp(-abs(l - 1.0) * u_sharp);
    col += pal(float(i) * 0.09 + l * 0.08 + u_hue + t * 0.004, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)) * w * (0.4 + 0.08 * float(i));
  }
  col = pow(col * 0.55, vec3(1.5)) * 2.2;
  col *= 0.4 + 0.6 * smoothstep(0.0, 0.08, r);
  col *= 1.0 - 0.25 * r * r;
  outColor = vec4(tonemap(col * 1.3), 1.0);
}`,
});
