/* Unter der Oberfläche: vom Meeresgrund nach oben – der Himmel im Snellschen Fenster, Lichtstrahlen, ein Fischschwarm */
DK.shaderScene({
  id: 'ozeanunten',
  name: 'Unter der Oberfläche',
  sub: 'Der Himmel, gesehen von einem Fisch',
  scale: 0.5,
  setup: () => ({
    u_sun: [DK.rand(-0.6, 0.6), DK.rand(-0.6, 0.6)],
    u_win: DK.rand(0.34, 0.46),
    u_fish: Math.random() < 0.75 ? 1 : 0,
  }),
  fs: `
uniform vec2 u_sun;
uniform float u_win;
uniform float u_fish;
void main() {
  vec2 uv = uvc();
  float t = u_time;
  // gewellte Oberfläche verzerrt alles, was man durch sie sieht
  vec2 w = vec2(fbm(uv * 2.5 + vec2(t * 0.12, 0.0)), fbm(uv * 2.5 + vec2(5.2, -t * 0.1))) - 0.5;
  vec2 q = uv + w * 0.08;
  float r = length(q);
  float win = 1.0 - smoothstep(u_win - 0.015, u_win + 0.015, r);
  float k = clamp(r / u_win, 0.0, 1.0);

  // im Fenster: der ganze Himmel, zum Rand hin gestaucht
  vec3 sky = mix(vec3(0.75, 0.92, 1.0), vec3(0.2, 0.5, 0.8), k * k);
  vec2 sp = u_sun * u_win * 0.6;
  float sd = length(q - sp);
  sky += vec3(1.0, 0.95, 0.8) * (exp(-sd * 30.0) * 2.5 + exp(-sd * 7.0) * 0.5);
  float rip = pow(abs(sin(fbm(q * 5.0 + t * 0.25) * 14.0)), 10.0);
  sky += vec3(0.8, 0.95, 1.0) * rip * 0.25 * (1.0 - k);

  // ausserhalb: Totalreflexion – man sieht die gespiegelte Tiefe
  vec3 deep = mix(vec3(0.02, 0.16, 0.26), vec3(0.0, 0.03, 0.08), smoothstep(u_win, 1.3, r));
  deep += vec3(0.05, 0.15, 0.2) * pow(fbm(q * 4.0 - t * 0.1), 3.0);
  float edge = exp(-abs(r - u_win) * 45.0);
  vec3 col = mix(deep, sky, win) + vec3(0.5, 0.8, 1.0) * edge * 0.35;

  // Lichtstrahlen, die schräg in die Tiefe fallen
  float a = atan(uv.y - sp.y * 0.3, uv.x - sp.x * 0.3);
  float rays = pow(vnoise(vec2(a * 9.0, t * 0.15)), 4.0) + 0.5 * pow(vnoise(vec2(a * 23.0 + 4.0, t * 0.2)), 6.0);
  float lr = length(uv);
  col += vec3(0.25, 0.55, 0.7) * rays * smoothstep(u_win * 0.6, u_win * 1.3, lr) * (1.0 - smoothstep(0.9, 1.6, lr)) * 0.5;

  // ein Fischschwarm zieht als Schattenriss vorbei
  if (u_fish > 0.5) {
    float ft = fract(t * 0.022 + u_seed);
    vec2 dir = vec2(cos(u_seed * 7.0), sin(u_seed * 7.0));
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 base = -dir * 1.5 + dir * ft * 3.0;
    float shade = 1.0;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      vec2 off = (hash22(vec2(fi, 3.0)) - 0.5) * 0.4;
      vec2 p = uv - base - off;
      vec2 pr = vec2(dot(p, dir), dot(p, nrm) + 0.006 * sin(t * 6.0 + fi + dot(p, dir) * 40.0));
      float body = length(pr * vec2(1.0, 2.6)) - 0.034;
      float tail = length((pr + vec2(0.048, 0.0)) * vec2(1.6, 1.1)) - 0.016;
      shade *= mix(0.35, 1.0, smoothstep(0.0, 0.006, min(body, tail)));
    }
    col *= shade;
  }

  // Schwebeteilchen
  vec2 g = uv * 9.0 + vec2(t * 0.05, t * 0.03);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + 7.0);
  col += vec3(0.6, 0.85, 1.0) * (1.0 - smoothstep(0.0, 0.05, length(f - (hash22(id) - 0.5) * 0.6))) * step(0.8, h) * 0.25;
  outColor = vec4(tonemap(col * 1.05), 1.0);
}`,
});
