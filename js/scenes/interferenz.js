/* Interferenz: wandernde Wellenquellen, als Farbfeld oder als feine Höhenlinien */
DK.shaderScene({
  id: 'interferenz',
  name: 'Interferenz',
  sub: 'Wellen, die sich begegnen',
  scale: 0.75,
  setup: () => ({
    u_n: DK.randInt(2, 6),
    u_freq: DK.rand(18, 45),
    u_mode: Math.random() < 0.5 ? 0 : 1,
    u_bands: DK.rand(3, 7),
  }),
  fs: `
uniform float u_n;
uniform float u_freq;
uniform float u_mode;
uniform float u_bands;
void main() {
  vec2 uv = uvc();
  float t = u_time;
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= u_n) break;
    vec2 c = 0.75 * vec2(sin(t * 0.06 * (1.0 + fi * 0.17) + fi * 2.1 + u_seed),
                         cos(t * 0.045 * (1.0 + fi * 0.13) + fi * 1.3 + u_seed * 1.7));
    float d = length(uv - c);
    s += sin(d * u_freq - t * 1.1 + fi * 1.3) / (1.0 + d * 1.5);
  }
  s += u_pointerActive * sin(length(uv - pointerUV()) * u_freq - t * 3.0);
  s /= sqrt(u_n);
  vec3 col;
  if (u_mode < 0.5) {
    float v = 0.5 + 0.5 * s;
    col = hsv2rgb(vec3(u_hue + v * 0.35 + 0.1 * sin(t * 0.03), 0.75, 1.0)) * pow(v, 3.0) * 1.4;
  } else {
    float q = s * u_bands + t * 0.15;
    float dl = abs(fract(q) - 0.5) / max(fwidth(q), 1e-4);
    float line = 1.0 - smoothstep(0.0, 2.2, dl);
    col = hsv2rgb(vec3(u_hue + floor(q + 0.5) * 0.04, 0.6, 1.0)) * line * (0.6 + 0.4 * abs(s));
  }
  col *= 1.0 - 0.2 * dot(uv, uv);
  outColor = vec4(tonemap(col * 1.2), 1.0);
}`,
});
