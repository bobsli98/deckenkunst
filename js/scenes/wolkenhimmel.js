/* Wolkenhimmel: auf der Wiese liegen und den Wolken zusehen – Mittag, Abendrot oder Morgendämmerung */
(function () {
  'use strict';
  const TIMES = [
    { n: 'Sommermittag', top: [0.16, 0.38, 0.72], hor: [0.5, 0.7, 0.9], cl: [1, 1, 1], sh: [0.55, 0.62, 0.75], sun: [1, 0.95, 0.8] },
    { n: 'Abendrot', top: [0.12, 0.12, 0.32], hor: [0.95, 0.45, 0.25], cl: [1, 0.72, 0.55], sh: [0.45, 0.22, 0.35], sun: [1, 0.6, 0.3] },
    { n: 'Morgendämmerung', top: [0.18, 0.25, 0.48], hor: [0.95, 0.75, 0.7], cl: [1, 0.88, 0.85], sh: [0.5, 0.48, 0.62], sun: [1, 0.85, 0.7] },
  ];
  DK.shaderScene({
    id: 'wolkenhimmel',
    name: 'Wolkenhimmel',
    sub: 'Rücklings im Gras',
    scale: 0.45,
    setup: () => {
      const T = DK.pick(TIMES);
      return {
        u_top: T.top, u_hor: T.hor, u_cl: T.cl, u_sh: T.sh, u_sunc: T.sun,
        u_cover: DK.rand(0.42, 0.62), u_wind: [DK.rand(-1, 1), DK.rand(-1, 1)],
        u_sun: [DK.rand(-0.9, 0.9), DK.rand(-0.6, 0.6)], u_bright: T.n === 'Sommermittag' ? 0.75 : 0.9,
      };
    },
    fs: `
uniform vec3 u_top, u_hor, u_cl, u_sh, u_sunc;
uniform float u_cover, u_bright;
uniform vec2 u_wind, u_sun;
float clouds(vec2 p) {
  float f = fbm(p) * 0.65 + fbm(p * 2.3 + 4.1) * 0.35;
  return smoothstep(u_cover, u_cover + 0.22, f);
}
void main() {
  vec2 uv = uvc();
  float t = u_time;
  vec2 drift = normalize(u_wind + 1e-3) * t * 0.012;
  vec2 p = uv * 1.6 + drift;
  // Himmel: aussen heller (Horizont rundherum), innen tiefes Blau (Zenit)
  float r = length(uv);
  vec3 sky = mix(u_top, u_hor, smoothstep(0.2, 1.1, r));
  float sd = length(uv - u_sun);
  sky += u_sunc * (exp(-sd * 6.0) * 0.8 + exp(-sd * 1.5) * 0.2);
  float c = clouds(p);
  // Schattenseite: weiter Richtung Sonne abtasten
  vec2 toSun = normalize(u_sun - uv + 1e-3) * 0.06;
  float c2 = clouds(p + toSun);
  float lit = clamp(1.0 - (c2 - c) * 2.5, 0.0, 1.0);
  vec3 cloudCol = mix(u_sh, u_cl, lit * 0.8 + 0.2);
  cloudCol += u_sunc * exp(-sd * 3.0) * 0.4 * (1.0 - c2);
  vec3 col = mix(sky, cloudCol, c * 0.95);
  // Silberrand, wo die Sonne durchscheint
  col += u_sunc * smoothstep(0.0, 0.3, c) * (1.0 - smoothstep(0.3, 0.7, c)) * exp(-sd * 2.0) * 0.5;
  outColor = vec4(col * u_bright, 1.0);
}`,
  });
})();
