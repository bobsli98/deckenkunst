/* Unter Wasser: Lichtnetze (Kaustiken) wie am Grund eines Pools */
DK.shaderScene({
  id: 'kaustik',
  name: 'Unter Wasser',
  sub: 'Licht, gebrochen an der Oberfläche',
  scale: 0.5,
  setup: () => ({
    u_scale: DK.rand(2.2, 3.6),
    u_speed: DK.rand(0.6, 1.1),
    u_tint: DK.rand(-0.06, 0.08),
  }),
  fs: `
uniform float u_scale;
uniform float u_speed;
uniform float u_tint;
float vedge(vec2 p, float t) {
  vec2 n = floor(p), f = p - n;
  ivec2 ni = ivec2(n);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.5 + 0.45 * sin(t + TAU * hashi2(ni + ivec2(i, j)));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}
float caustic(vec2 p, vec2 w, float t) {
  float e1 = vedge(p + w, t);
  float e2 = vedge(p * 1.7 + w * 1.4 + 3.7, t * 1.25 + 2.0);
  return pow(1.0 - smoothstep(0.0, 0.2, e1), 3.0) + 0.55 * pow(1.0 - smoothstep(0.0, 0.14, e2), 3.0);
}
void main() {
  vec2 uv = uvc();
  float t = u_time * u_speed;
  vec2 p = uv * u_scale + vec2(t * 0.03, t * 0.02);
  vec2 w = vec2(fbm(p * 0.45 + t * 0.04), fbm(p * 0.45 - t * 0.04 + 7.3)) * 1.3;

  // Wellenring um den Mauszeiger
  vec2 pu = pointerUV();
  float pd = length(uv - pu);
  w += u_pointerActive * 0.15 * sin(pd * 40.0 - u_time * 6.0) * exp(-pd * 4.0) * normalize(uv - pu + 1e-4);

  float sp = 0.018;
  vec3 c = vec3(caustic(p + vec2(sp, 0.0), w, t), caustic(p, w, t), caustic(p - vec2(sp, 0.0), w, t));
  float hb = 0.56 + u_tint + 0.05 * sin(u_hue * TAU);
  vec3 deep = hsv2rgb(vec3(hb, 0.9, 0.08));
  vec3 lightc = hsv2rgb(vec3(hb - 0.06, 0.3, 1.0));
  vec3 col = deep * (0.5 + 0.8 * fbm(uv * 1.5 + t * 0.05));
  col += c * lightc * (0.9 + u_audio.x * 0.8);

  // Sonne hinter der Wasseroberfläche
  vec2 sun = vec2(0.35 * sin(t * 0.03 + u_seed), 0.25 * cos(t * 0.025 + u_seed));
  col += lightc * 0.35 * exp(-length(uv - sun) * 2.2);

  // Schwebeteilchen
  vec2 q = uv * 7.0 + vec2(t * 0.06, -t * 0.045);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash12(id + 11.0);
  vec2 o = (hash22(id + 3.0) - 0.5) * 0.6 + 0.12 * vec2(sin(t * 0.7 + h * 20.0), cos(t * 0.6 + h * 13.0));
  col += lightc * (1.0 - smoothstep(0.0, 0.05, length(f - o))) * step(0.72, h) * 0.5;

  col *= 1.0 - 0.3 * dot(uv, uv);
  outColor = vec4(tonemap(col * 1.4), 1.0);
}`,
});
