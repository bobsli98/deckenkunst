/* Regenteich: Tropfen fallen auf eine dunkle Wasserfläche, in der sich Mond oder Laternen spiegeln */
DK.shaderScene({
  id: 'regenteich',
  name: 'Regenteich',
  sub: 'Jeder Tropfen ein Kreis',
  scale: 0.45,
  setup: () => ({
    u_rate: DK.rand(0.6, 1.4),
    u_warm: Math.random() < 0.5 ? 1 : 0,
    u_moon: [DK.rand(-0.4, 0.4), DK.rand(-0.3, 0.3)],
  }),
  fs: `
uniform float u_rate;
uniform float u_warm;
uniform vec2 u_moon;
// Höhe der Wellen einer Ebene: pro Zelle ein Tropfen mit eigenem Takt
float ripples(vec2 p, float t, float scale) {
  p *= scale;
  vec2 id = floor(p);
  ivec2 ii = ivec2(id);
  ivec2 sd = ivec2(int(u_seed * 1000.0), int(scale * 100.0));
  float h = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 ci = ii + ivec2(i, j);
    vec2 c = vec2(ci);
    vec2 rnd = hashi2(ci + sd);
    float cyc = t * u_rate * (0.3 + rnd.y * 0.3) + rnd.x;
    float ph = fract(cyc);
    // nicht jede Zelle bekommt in jedem Durchgang einen Tropfen
    vec2 rr = hashi2(ci * 7 + ivec2(int(floor(cyc)), 13) + sd);
    if (rr.y > 0.75) continue;
    vec2 pos = c + 0.15 + 0.7 * rr;
    float d = length(p - pos);
    float r = ph * 1.2;
    float ring = sin((d - r) * 30.0) * exp(-abs(d - r) * 10.0);
    h += ring * (1.0 - ph) * (1.0 - ph) * (1.0 - ph) * (1.0 - smoothstep(0.0, 1.2, d));
  }
  return h;
}
float height(vec2 p, float t) {
  return ripples(p, t, 2.2) + 0.5 * ripples(p + 7.3, t * 1.13, 4.0) +0.05 * sin(p.x * 3.0 + t * 0.4) * sin(p.y * 2.0 - t * 0.3);
}
void main() {
  vec2 uv = uvc();
  float t = u_time;
  float e = 0.004;
  float h0 = height(uv, t);
  vec2 g = vec2(height(uv + vec2(e, 0.0), t) - h0, height(uv + vec2(0.0, e), t) - h0) / e;
  vec3 n = normalize(vec3(-g * 0.02, 1.0));
  // Spiegelung: verzerrter Blick auf Himmel, Mond und Lichter
  vec2 q = uv + n.xy * 0.35;
  vec3 skyTop = mix(vec3(0.02, 0.04, 0.09), vec3(0.06, 0.03, 0.02), u_warm);
  vec3 col = skyTop * (1.2 - 0.6 * length(uv));
  vec3 moonC = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.7, 0.4), u_warm);
  float md = length(q - u_moon);
  col += moonC * (exp(-md * 18.0) * 1.6 + exp(-md * 3.5) * 0.25);
  // ein paar ferne Laternen am Ufer
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    vec2 lp = vec2(sin(fk * 2.4 + u_seed) * 0.8, cos(fk * 1.7 + u_seed) * 0.45);
    float ld = length((q - lp) * vec2(1.0, 0.6));
    col += mix(vec3(1.0, 0.55, 0.2), vec3(0.4, 0.7, 1.0), step(2.5, fk)) * exp(-ld * 22.0) * 0.6;
  }
  // Glanzlichter nur dort, wo Wellen das Licht kippen
  float slope = length(g) * 0.02;
  col += moonC * smoothstep(0.08, 0.35, slope) * 0.08;
  col *= 0.85 + 0.3 * smoothstep(-0.5, 0.5, h0);
  outColor = vec4(tonemap(col * 1.3), 1.0);
}`,
});
