/* Deckenkunst – WebGL2-Helfer: Programme, Render-Targets, Partikel-Batches, Shader-Szenen */
(function () {
  'use strict';
  const G = (DK.gl = {});

  G.HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

  // Vollbild-Dreieck ohne Vertex-Buffer
  G.VS_FULL = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Gemeinsame GLSL-Bibliothek (nur Funktionen)
  G.LIB = `
#define PI 3.14159265359
#define TAU 6.28318530718
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Ganzzahl-Hash (nach Inigo Quilez): exakt, daher keine Nähte zwischen Rauschzellen,
// egal wie der Grafiktreiber die Fliesskomma-Rechnung umstellt
uint uhash(uvec2 x) {
  uvec2 q = 1103515245u * ((x >> 1u) ^ x.yx);
  uint n = 1103515245u * (q.x ^ (q.y >> 3u));
  return n;
}
float hashi(ivec2 c) { return float(uhash(uvec2(c))) * (1.0 / 4294967295.0); }
vec2 hashi2(ivec2 c) {
  uint n = uhash(uvec2(c));
  return vec2(float(n), float(n * 48271u)) * (1.0 / 4294967295.0);
}
float vnoise(vec2 p) {
  vec2 fl = floor(p);
  ivec2 i = ivec2(fl);
  vec2 f = p - fl;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashi(i), hashi(i + ivec2(1, 0)), u.x),
             mix(hashi(i + ivec2(0, 1)), hashi(i + ivec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p + 17.1; a *= 0.5; }
  return v;
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(TAU * (c * t + d)); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float stars(vec2 uv, float density, float t, float seed) {
  vec2 g = uv * density;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  if (h < 0.9) return 0.0;
  vec2 o = (hash22(id + seed * 1.3) - 0.5) * 0.6;
  float d = length(f - o);
  float tw = 0.55 + 0.45 * sin(t * (0.7 + h * 2.5) + h * 50.0);
  return (1.0 - smoothstep(0.0, 0.14, d)) * tw * (h - 0.9) * 10.0;
}
`;

  // Standard-Uniforms für Shader-Szenen
  G.STD = `
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_hue;
uniform vec4 u_audio;
uniform vec2 u_pointer;
uniform float u_pointerActive;
out vec4 outColor;
vec2 uvc() { return (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y); }
vec2 pointerUV() { return (u_pointer * u_res - 0.5 * u_res) / min(u_res.x, u_res.y); }
vec3 tonemap(vec3 c) { return 1.0 - exp(-max(c, vec3(0.0))); }
`;

  G.compile = function (gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n');
      gl.deleteShader(s);
      throw new Error('Shader-Fehler:\n' + log + '\n' + numbered);
    }
    return s;
  };

  G.program = function (gl, vs, fs) {
    const p = gl.createProgram();
    const v = G.compile(gl, gl.VERTEX_SHADER, vs);
    const f = G.compile(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link-Fehler: ' + gl.getProgramInfoLog(p));
    const loc = {}, types = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      loc[name] = gl.getUniformLocation(p, info.name);
      types[name] = info.type;
    }
    return { p, loc, types };
  };

  // Uniforms anhand ihres GLSL-Typs setzen; unbekannte Namen werden ignoriert
  G.set = function (gl, prog, values) {
    for (const k in values) {
      const l = prog.loc[k];
      if (l == null) continue;
      const v = values[k];
      switch (prog.types[k]) {
        case gl.FLOAT: typeof v === 'number' ? gl.uniform1f(l, v) : gl.uniform1fv(l, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(l, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(l, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(l, v); break;
        case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: gl.uniform1i(l, v); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(l, false, v); break;
      }
    }
  };

  G.target = function (gl, w, h, o = {}) {
    const internal = o.internal || gl.RGBA16F;
    const type = o.type || gl.HALF_FLOAT;
    const filter = o.filter || gl.LINEAR;
    const wrap = o.wrap || gl.CLAMP_TO_EDGE;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('Framebuffer unvollständig');
    return { tex, fbo, w, h, destroy() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); } };
  };

  // Vollbild-Pass mit eigenem Fragment-Shader
  G.pass = function (gl, fs) {
    const prog = G.program(gl, G.VS_FULL, fs);
    const vao = gl.createVertexArray();
    return {
      prog,
      draw(uniforms, tex) {
        gl.useProgram(prog.p);
        if (tex) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
        }
        if (uniforms) G.set(gl, prog, uniforms);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      },
      destroy() { gl.deleteProgram(prog.p); gl.deleteVertexArray(vao); },
    };
  };

  // Punkte/Linien mit Farbe pro Vertex: [x, y, r, g, b] in Clip-Space
  const VS_PTS = `#version 300 es
in vec2 a_pos;
in vec3 a_col;
uniform float u_size;
out vec3 v_col;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); gl_PointSize = u_size; v_col = a_col; }`;
  const FS_PTS = G.HEADER + `
in vec3 v_col;
uniform float u_round;
out vec4 o;
void main() {
  float a = 1.0;
  if (u_round > 0.5) a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
  o = vec4(v_col * a, 1.0);
}`;
  G.batch = function (gl, maxVerts) {
    const prog = G.program(gl, VS_PTS, FS_PTS);
    const data = new Float32Array(maxVerts * 5);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog.p, 'a_pos');
    const aCol = gl.getAttribLocation(prog.p, 'a_col');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 20, 8);
    gl.bindVertexArray(null);
    return {
      data,
      max: maxVerts,
      draw(count, mode, size = 1, round = 0, offset = 0) {
        if (count <= 0) return;
        gl.useProgram(prog.p);
        G.set(gl, prog, { u_size: size, u_round: round });
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, offset * 5, count * 5);
        gl.drawArrays(mode, 0, count);
        gl.bindVertexArray(null);
      },
      destroy() { gl.deleteProgram(prog.p); gl.deleteBuffer(buf); gl.deleteVertexArray(vao); },
    };
  };

  // HDR-Leuchtspuren: Float-Puffer, der pro Frame verblasst und additiv bemalt wird
  G.trails = function (gl, w, h) {
    const clear = G.pass(gl, G.HEADER + 'out vec4 o; void main() { o = vec4(0.0); }');
    let tgt = G.target(gl, w, h);
    return {
      get tex() { return tgt.tex; },
      get w() { return tgt.w; },
      get h() { return tgt.h; },
      bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo); gl.viewport(0, 0, tgt.w, tgt.h); },
      fade(f) {
        gl.enable(gl.BLEND);
        gl.blendColor(0, 0, 0, f);
        gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
        clear.draw();
      },
      additive() { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); },
      resize(nw, nh) { tgt.destroy(); tgt = G.target(gl, nw, nh); },
      destroy() { tgt.destroy(); clear.destroy(); },
    };
  };

  // Shader-Szene: nur Fragment-Shader + zufällige Parameter pro Besuch
  DK.shaderScene = function (def) {
    DK.register({
      id: def.id,
      name: def.name,
      sub: def.sub,
      type: 'webgl2',
      scale: def.scale || 0.6,
      create(gl) {
        const pass = G.pass(gl, G.HEADER + G.LIB + G.STD + def.fs);
        const params = def.setup ? def.setup() : {};
        const seed = DK.rand(0, 100);
        const t0 = DK.rand(0, 400);
        const ptr = [0.5, 0.5];
        const res = [1, 1];
        return {
          render(t, dt, env) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.disable(gl.BLEND);
            gl.viewport(0, 0, env.w, env.h);
            ptr[0] = env.pointer.nx;
            ptr[1] = 1 - env.pointer.ny;
            res[0] = env.w;
            res[1] = env.h;
            if (def.update) def.update(params, t, dt, env);
            pass.draw(Object.assign({
              u_res: res, u_time: t + t0, u_seed: seed, u_hue: env.hue, u_audio: env.audioVec,
              u_pointer: ptr, u_pointerActive: env.pointer.active,
            }, params));
          },
          destroy() { pass.destroy(); },
        };
      },
    });
  };
})();
