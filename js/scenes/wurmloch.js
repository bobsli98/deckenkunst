/* Wurmloch: ein Tunnel aus Licht, der die Decke öffnet */
DK.shaderScene({
  id: 'wurmloch',
  name: 'Wurmloch',
  sub: 'Die Decke ist nur eine Tür',
  scale: 0.6,
  setup: () => ({
    u_k: DK.pick([10, 12, 16, 20, 24]),
    u_twist: DK.rand(-1.5, 1.5),
    u_speed: DK.rand(0.25, 0.5),
    u_style: Math.random(),
  }),
  fs: `
uniform float u_k;
uniform float u_twist;
uniform float u_speed;
uniform float u_style;
void main() {
  vec2 uv = uvc();
  float t = u_time;
  vec2 d = uv - 0.12 * vec2(sin(t * 0.11), cos(t * 0.083));
  float r = length(d);
  float a = atan(d.y, d.x);
  float z = 0.4 / max(r, 0.002) + t * (u_speed + u_audio.y * 0.5);
  float ang = a / TAU + z * u_twist * 0.03 + t * 0.01;
  vec2 tc = vec2(ang * u_k, z * 1.8);
  vec2 id = floor(tc);
  vec2 g = fract(tc) - 0.5;
  vec2 fw = fwidth(tc);
  float line = max(1.0 - smoothstep(0.0, fw.x * 1.5 + 0.02, 0.5 - abs(g.x)),
                   1.0 - smoothstep(0.0, fw.y * 1.5 + 0.02, 0.5 - abs(g.y)));
  float h = hash12(vec2(mod(id.x, u_k), id.y) + u_seed);
  float tile = step(0.78, h) * (0.5 + 0.5 * sin(t * 1.5 + h * 40.0));
  float glyph = 0.0;
  if (u_style > 0.5) glyph = (1.0 - smoothstep(0.0, 0.06 + fw.x, abs(length(g) - 0.25))) * step(0.5, h);
  vec3 hc = hsv2rgb(vec3(u_hue + z * 0.015 + h * 0.12, 0.75, 1.0));
  float fog = smoothstep(0.0, 0.5, r);
  vec3 col = hc * (line * 0.6 + tile * 0.5 + glyph * 0.6 + 0.04) * fog * (1.0 + u_audio.x);
  col += hsv2rgb(vec3(u_hue + 0.5, 0.35, 1.0)) * exp(-r * 7.0) * 0.9;
  outColor = vec4(tonemap(col * 1.4), 1.0);
}`,
});
