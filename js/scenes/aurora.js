/* Polarlicht: Lichtvorhänge über einem Sternenhimmel */
DK.shaderScene({
  id: 'aurora',
  name: 'Polarlicht',
  sub: 'Vorhänge aus Sonnenwind',
  scale: 0.5,
  setup: () => ({
    u_tilt: DK.rand(-0.7, 0.7),
    u_hueOff: DK.rand(-0.1, 0.12),
    u_speed: DK.rand(0.7, 1.4),
  }),
  fs: `
uniform float u_tilt;
uniform float u_hueOff;
uniform float u_speed;
void main() {
  vec2 uv = uvc();
  float t = u_time * u_speed;
  vec2 q = rot(u_tilt + 0.05 * sin(t * 0.017)) * uv;
  vec3 col = vec3(0.0, 0.004, 0.014) * (1.2 - length(uv) * 0.6);
  col += vec3(0.75, 0.85, 1.0) * (stars(uv, 55.0, u_time, u_seed) + 0.6 * stars(uv + 3.7, 95.0, u_time, u_seed + 7.0));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = q.x * (0.75 + fi * 0.18) + fi * 1.9 + u_seed;
    float base = (fbm(vec2(x * 0.7, t * 0.025 + fi * 5.3)) - 0.5) * 1.5 + (fi - 1.5) * 0.24 + 0.08 * sin(x * 1.7 + t * 0.09);
    float d = q.y - base;
    float rays = fbm(vec2(x * 14.0 + t * 0.05, t * 0.22 + fi * 3.1));
    rays = 0.15 + 1.6 * rays * rays;
    float curtain = smoothstep(-0.02, 0.012, d) * exp(-max(d, 0.0) * (4.8 - fi * 0.7));
    float hem = exp(-abs(d) * 55.0);
    float shimmer = 0.75 + 0.25 * sin(x * 25.0 + t * 1.7 + fi * 2.0);
    float hh = u_hueOff + 0.07 * sin(u_hue * TAU + fi);
    vec3 green = hsv2rgb(vec3(0.37 + hh, 0.85, 1.0));
    vec3 violet = hsv2rgb(vec3(0.82 + hh, 0.65, 1.0));
    vec3 c = mix(green, violet, smoothstep(0.02, 0.45, d));
    c = mix(c, vec3(1.0, 0.45, 0.55), hem * 0.25);
    col += c * (curtain * rays * shimmer + hem * rays * 0.5) * (0.6 - fi * 0.09) * (1.0 + u_audio.y * 0.9);
  }
  outColor = vec4(tonemap(col * 1.5), 1.0);
}`,
});
