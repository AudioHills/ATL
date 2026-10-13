// Cinematic post stack (custom, no EffectComposer):
//
//   world → [HDR MSAA target + float depth]
//     → GTAO (half res, depth-reconstructed normals) + bilateral blur → multiplied in
//     → SSR for glossy horizontal surfaces (wet asphalt, polished tile) → blended in
//     → god-ray occlusion mask + 3-pass radial blur (quarter res)
//   viewmodel → same target (depth cleared, so it's never occluded/AO'd)
//     → physically based bloom (13-tap down / tent up mip chain) + lens dirt
//     → eye adaptation (log-average luminance, temporally smoothed)
//     → grade: white balance, split toning, saturation, ACES filmic, contrast curve,
//       vignette, subtle chromatic aberration, film grain, dithering
//     → FXAA (medium only; high uses 4x MSAA)
//
// Low quality bypasses all of it and renders straight to the canvas.
import * as THREE from 'three';
import { FXAAShader } from '../lib/addons/shaders/FXAAShader.js';
import { GTAOShader, generateMagicSquareNoise } from '../lib/addons/shaders/GTAOShader.js';
import { atmo } from './atmosphere.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const DEPTH_FNS = `
  uniform mat4 uProj, uProjInv;
  uniform float uNear, uFar;
  float viewZ(float d){ return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
  vec3 viewPos(vec2 uv, float d){
    vec4 c = vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
    vec4 v = uProjInv * c; return v.xyz / v.w;
  }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

function mat(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
}

// ---------- AO ----------
const AO_BLUR = `
  uniform sampler2D tAO, tDepth; uniform vec2 dir; uniform float intensity; varying vec2 vUv;
  ${DEPTH_FNS}
  void main(){
    float dc = texture2D(tDepth, vUv).x;
    if (dc >= 1.0) { gl_FragColor = vec4(1.0); return; }
    float zc = viewZ(dc);
    float s = 0.0, w = 0.0;
    for (int i = -4; i <= 4; i++) {
      vec2 uv = vUv + dir * float(i);
      float z = viewZ(texture2D(tDepth, uv).x);
      float wi = exp(-float(i * i) * 0.12) * max(0.0, 1.0 - abs(z - zc) / (0.04 * abs(zc) + 0.05));
      s += texture2D(tAO, uv).r * wi; w += wi;
    }
    float ao = s / max(w, 1e-4);
    // last pass: fold in intensity and fade with distance (screen-space AO gets unreliable far away)
    if (intensity >= 0.0) ao = mix(1.0, ao, intensity * (1.0 - smoothstep(35.0, 80.0, -zc)));
    gl_FragColor = vec4(vec3(ao), 1.0);
  }`;

const AO_APPLY = `
  uniform sampler2D tAO; uniform vec3 aoTint; varying vec2 vUv;
  void main(){
    float ao = texture2D(tAO, vUv).r;
    // tinted occlusion: shadows pick up a little of the ambient hue instead of going grey
    vec3 c = mix(aoTint, vec3(1.0), ao) * ao;
    gl_FragColor = vec4(c, 1.0);
  }`;

// ---------- SSR ----------
const SSR = `
  uniform sampler2D tColor, tDepth; uniform vec3 upView; uniform float strength; uniform vec2 res; varying vec2 vUv;
  ${DEPTH_FNS}
  vec2 project(vec3 p){ vec4 c = uProj * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
  void main(){
    vec4 c = texture2D(tColor, vUv);
    float refl = 1.0 - c.a;
    float d = texture2D(tDepth, vUv).x;
    if (refl < 0.03 || d >= 1.0) { gl_FragColor = vec4(0.0); return; }
    vec3 P = viewPos(vUv, d);
    vec3 V = normalize(P);
    // glossy reflections: jitter the micro-normal by roughness. Stretched along the view
    // direction this gives the long vertical streaks of real wet asphalt.
    float rough = 1.0 - sqrt(refl);
    float jit = ign(gl_FragCoord.xy);
    float jit2 = ign(gl_FragCoord.yx * 1.37 + 11.0);
    vec3 t1 = normalize(cross(upView, vec3(0.0, 0.0, 1.0)));
    vec3 t2 = cross(upView, t1);
    vec3 Nm = normalize(upView + (t1 * (jit - 0.5) + t2 * (jit2 - 0.5)) * rough * 0.45);
    vec3 R = reflect(V, Nm);
    const int STEPS = 40;
    const float MAXD = 70.0;
    float tPrev = 0.0, tHit = -1.0;
    vec2 uvHit = vec2(0.0);
    bool sky = false;
    for (int i = 1; i <= STEPS; i++) {
      float s = (float(i) - 1.0 + jit) / float(STEPS);
      float t = MAXD * s * s + 0.06;
      vec3 Q = P + R * t;
      if (Q.z > -uNear) break;
      vec2 uv = project(Q);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sd = texture2D(tDepth, uv).x;
      if (sd >= 1.0) { sky = true; uvHit = uv; tPrev = t; continue; }
      sky = false;
      float diff = viewZ(sd) - Q.z;
      float thick = 0.35 + t * 0.06;
      if (diff > 0.0 && diff < thick) {
        // binary refinement
        float a = tPrev, b = t;
        for (int k = 0; k < 5; k++) {
          float m = 0.5 * (a + b);
          vec3 M = P + R * m; vec2 muv = project(M);
          float md = viewZ(texture2D(tDepth, muv).x) - M.z;
          if (md > 0.0) b = m; else a = m;
        }
        tHit = b; uvHit = project(P + R * b);
        break;
      }
      tPrev = t;
    }
    vec3 col; float conf;
    if (tHit > 0.0) {
      col = texture2D(tColor, uvHit).rgb;
      conf = 1.0 - smoothstep(MAXD * 0.6, MAXD, tHit);
    } else if (sky) {
      col = texture2D(tColor, uvHit).rgb;
      conf = 0.85;
    } else { gl_FragColor = vec4(0.0); return; }
    vec2 e = min(uvHit, 1.0 - uvHit);
    conf *= smoothstep(0.0, 0.06, e.x) * smoothstep(0.0, 0.1, e.y);
    float cosT = clamp(dot(-V, upView), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
    float w = clamp(refl * mix(0.35, 1.0, fres) * conf * strength, 0.0, 0.92);
    col = min(col, vec3(30.0));
    gl_FragColor = vec4(col * w, w);
  }`;

// Reads the resolved scene texture for roughness while drawing into the MSAA buffer
// (different framebuffer), so SSR is only enabled with MSAA (high quality).
const SSR_APPLY = `
  uniform sampler2D tSSR, tColor; uniform vec2 texel; varying vec2 vUv;
  void main(){
    float refl = 1.0 - texture2D(tColor, vUv).a;
    float rough = 1.0 - sqrt(clamp(refl, 0.0, 1.0));
    // anisotropic (mostly vertical) blur that widens with roughness, also denoises the jitter
    vec2 r = texel * vec2(0.6 + rough * 1.6, 0.8 + rough * 5.0);
    vec4 s = vec4(0.0); float w = 0.0;
    for (int i = -4; i <= 4; i++) {
      float fi = float(i);
      float wi = exp(-fi * fi * 0.18);
      s += texture2D(tSSR, vUv + vec2(r.x * fi * 0.35, r.y * fi)) * wi; w += wi;
    }
    s /= w;
    // premultiplied: dst = src.rgb + dst * (1 - src.a)
    gl_FragColor = s;
  }`;

// ---------- god rays ----------
const RAY_MASK = `
  uniform sampler2D tColor, tDepth; uniform vec2 sunUv; uniform float aspect; varying vec2 vUv;
  void main(){
    float d = texture2D(tDepth, vUv).x;
    if (d < 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 c = texture2D(tColor, vUv).rgb;
    vec2 dd = (vUv - sunUv) * vec2(aspect, 1.0);
    float fall = exp(-dot(dd, dd) * 7.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * fall * smoothstep(0.05, 2.0, l), 1.0);
  }`;
const RAY_BLUR = `
  uniform sampler2D tIn; uniform vec2 sunUv; uniform float stepSize; varying vec2 vUv;
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main(){
    vec2 delta = (sunUv - vUv);
    float dist = length(delta);
    vec2 stepv = delta / max(dist, 1e-4) * min(dist, stepSize);
    vec2 uv = vUv + stepv * ign(gl_FragCoord.xy);
    vec3 s = vec3(0.0);
    float w = 0.0, wi = 1.0;
    for (int i = 0; i < 8; i++) { s += texture2D(tIn, uv).rgb * wi; w += wi; wi *= 0.94; uv += stepv; }
    gl_FragColor = vec4(s / w, 1.0);
  }`;

// ---------- bloom ----------
const DOWN = `
  uniform sampler2D tIn; uniform vec2 texel; uniform float karis; varying vec2 vUv;
  vec3 tap(vec2 o){ return min(texture2D(tIn, vUv + o * texel).rgb, vec3(60.0)); }
  float kw(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
  void main(){
    vec3 a = tap(vec2(-2.0, 2.0)), b = tap(vec2(0.0, 2.0)), c = tap(vec2(2.0, 2.0));
    vec3 d = tap(vec2(-2.0, 0.0)), e = tap(vec2(0.0)), f = tap(vec2(2.0, 0.0));
    vec3 g = tap(vec2(-2.0, -2.0)), h = tap(vec2(0.0, -2.0)), i = tap(vec2(2.0, -2.0));
    vec3 j = tap(vec2(-1.0, 1.0)), k = tap(vec2(1.0, 1.0)), l = tap(vec2(-1.0, -1.0)), m = tap(vec2(1.0, -1.0));
    vec3 r;
    if (karis > 0.5) {
      vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
      float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
      r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
    } else {
      r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    }
    gl_FragColor = vec4(r, 1.0);
  }`;
const UP = `
  uniform sampler2D tIn; uniform vec2 texel; uniform float radius; varying vec2 vUv;
  void main(){
    vec2 o = texel * radius;
    vec3 s = texture2D(tIn, vUv).rgb * 4.0;
    s += (texture2D(tIn, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tIn, vUv + vec2(o.x, 0.0)).rgb + texture2D(tIn, vUv + vec2(0.0, o.y)).rgb + texture2D(tIn, vUv + vec2(0.0, -o.y)).rgb) * 2.0;
    s += texture2D(tIn, vUv + o).rgb + texture2D(tIn, vUv - o).rgb + texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb + texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb;
    gl_FragColor = vec4(s / 16.0, 1.0);
  }`;

// ---------- eye adaptation ----------
const LUM = `
  uniform sampler2D tIn, tPrev; uniform float rate, first; varying vec2 vUv;
  void main(){
    float s = 0.0;
    for (int y = 0; y < 5; y++) for (int x = 0; x < 7; x++) {
      vec2 uv = vec2((float(x) + 0.5) / 7.0, (float(y) + 0.5) / 5.0);
      // centre-weighted metering
      vec2 dc = uv - 0.5; float w = 1.0 - dot(dc, dc) * 1.2;
      vec3 c = texture2D(tIn, uv).rgb;
      s += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4)) * w;
    }
    float L = exp(s / 25.2);
    float prev = texture2D(tPrev, vec2(0.5)).r;
    gl_FragColor = vec4(first > 0.5 ? L : mix(prev, L, rate), 0.0, 0.0, 1.0);
  }`;

// ---------- final grade ----------
const FINAL = `
  uniform sampler2D tScene, tBloom, tRays, tLum, tDirt;
  uniform float time, hurt, exposure, bloomMix, dirtAmt, rays, vignette, grain, saturation, contrast, ca;
  uniform float adaptKey, adaptMin, adaptMax, adaptOn;
  uniform vec3 tint, rayColor, shadowTint, highTint, lift;
  uniform vec2 res;
  varying vec2 vUv;
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec3 rrtOdtFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 acesFit(vec3 c){
    const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c = I * (c / 0.6); c = rrtOdtFit(c); return clamp(O * c, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main(){
    vec2 uv = vUv;
    vec2 d = uv - 0.5;
    float r2 = dot(d, d);
    // lens chromatic aberration, only toward the frame edges
    float cav = (ca + hurt * 0.006) * r2;
    vec3 col;
    col.r = texture2D(tScene, uv - d * cav).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv + d * cav).b;
    vec3 bloom = texture2D(tBloom, uv).rgb * (1.0 / 6.0);
    col = mix(col, bloom, bloomMix);
    col += bloom * texture2D(tDirt, uv).rgb * dirtAmt;
    col += texture2D(tRays, uv).rgb * rayColor * rays;
    // exposure + eye adaptation
    float e = exposure;
    if (adaptOn > 0.5) {
      float L = texture2D(tLum, vec2(0.5)).r;
      e *= clamp(adaptKey / max(L, 1e-4), adaptMin, adaptMax);
    }
    col *= e;
    // grade in scene-linear
    col *= tint;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float sh = 1.0 - smoothstep(0.0, 0.35, l);
    float hi = smoothstep(0.35, 1.6, l);
    col *= mix(vec3(1.0), shadowTint, sh) * mix(vec3(1.0), highTint, hi);
    col += lift * (1.0 - smoothstep(0.0, 0.25, l));
    l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(l), col, saturation * (1.0 - hurt * 0.7)), 0.0);
    col = acesFit(col);
    col = toSRGB(col);
    // filmic contrast around mid-grey
    col = clamp(col, 0.0, 1.0);
    col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
    // vignette (optical falloff), stronger when hurt
    float v = 1.0 - smoothstep(0.25, 1.1, sqrt(r2) * 1.414) ;
    col *= mix(1.0, v, vignette + hurt * 0.45);
    col = mix(col, col * vec3(1.0, 0.35, 0.3), hurt * smoothstep(0.15, 0.5, r2) * 0.8);
    // grain (luma-weighted, stronger in shadows like film) + dither
    float g = fract(sin(dot(uv * res + fract(time * 13.7) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += g * grain * (1.2 - lum);
    col += (ign(gl_FragCoord.xy + fract(time) * 64.0) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 288);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = r() * 512, y = r() * 288, rad = 4 + r() * r() * 30, a = 0.05 + r() * 0.12;
    const grd = g.createRadialGradient(x, y, rad * 0.6, x, y, rad);
    grd.addColorStop(0, `rgba(255,250,240,${a})`); grd.addColorStop(0.85, `rgba(255,250,240,${a * 1.4})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * 512, y = r() * 288, rad = 40 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(200,210,220,0.09)'); grd.addColorStop(1, 'rgba(200,210,220,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  // a base level so bright light always picks up some veil
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, 512, 288);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const RAY_STEPS = [0.06, 0.025, 0.009];
const rtOpts = (extra = {}) => ({ type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...extra });

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene; this.camera = camera;
    this.quality = null;
    this.time = 0;
    this.look = {};
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.v3 = new THREE.Vector3();
    this.v3b = new THREE.Vector3();
    this.upView = new THREE.Vector3();
    this.firstLum = true;
  }

  pass(material, target, clear = false) {
    const r = this.renderer;
    this.quad.material = material;
    r.setRenderTarget(target);
    if (clear) r.clear();
    r.render(this.quadScene, this.quadCam);
  }

  disposeTargets() {
    for (const t of this.targets || []) t.dispose();
    this.targets = [];
  }

  setQuality(q, w, h) {
    if (q === this.quality && this.sceneRT) return;
    this.quality = q;
    this.disposeTargets();
    this.sceneRT = null;
    if (q === 'low') return;
    const high = q === 'high';
    this.useSSR = high;
    this.useAO = true;
    this.useRays = true;
    this.useFXAA = !high;
    const depth = new THREE.DepthTexture(1, 1, THREE.FloatType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 0, depthBuffer: true, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, rtOpts({ type: THREE.UnsignedByteType }));
    this.aoRT2 = this.aoRT.clone();
    this.ssrRT = new THREE.WebGLRenderTarget(1, 1, rtOpts());
    this.rayA = new THREE.WebGLRenderTarget(1, 1, rtOpts());
    this.rayB = this.rayA.clone();
    this.mips = [];
    for (let i = 0; i < 6; i++) this.mips.push(new THREE.WebGLRenderTarget(1, 1, rtOpts()));
    this.lumA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.lumB = this.lumA.clone();
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.targets = [this.sceneRT, this.aoRT, this.aoRT2, this.ssrRT, this.rayA, this.rayB, ...this.mips, this.lumA, this.lumB, this.ldrRT];
    this.firstLum = true;

    const depthU = () => ({ uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uNear: { value: 0.05 }, uFar: { value: 900 } });
    this.depthMats = [];
    const dm = (m) => { this.depthMats.push(m); return m; };

    // AO
    this.gtao = new THREE.ShaderMaterial({
      defines: { ...GTAOShader.defines, NORMAL_VECTOR_TYPE: 0, SAMPLES: high ? 16 : 8, DEPTH_SWIZZLING: 'x' },
      uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader: VERT, fragmentShader: GTAOShader.fragmentShader, depthTest: false, depthWrite: false,
    });
    this.gtao.uniforms.tNoise.value = generateMagicSquareNoise();
    this.gtao.uniforms.tDepth.value = depth;
    Object.assign(this.gtao.uniforms, { });
    this.aoBlur = dm(mat(AO_BLUR, { tAO: { value: null }, tDepth: { value: depth }, dir: { value: new THREE.Vector2() }, intensity: { value: -1 }, ...depthU() }));
    this.aoApply = mat(AO_APPLY, { tAO: { value: this.aoRT.texture }, aoTint: { value: new THREE.Color(0.2, 0.22, 0.3) } }, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation,
    });
    // SSR
    this.ssr = dm(mat(SSR, { tColor: { value: this.sceneRT.texture }, tDepth: { value: depth }, upView: { value: this.upView }, strength: { value: 1 }, res: { value: new THREE.Vector2() }, ...depthU() }));
    this.ssrApply = mat(SSR_APPLY, { tSSR: { value: this.ssrRT.texture }, tColor: { value: this.sceneRT.texture }, texel: { value: new THREE.Vector2() } }, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation,
    });
    // rays
    this.rayMask = mat(RAY_MASK, { tColor: { value: this.sceneRT.texture }, tDepth: { value: depth }, sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 } });
    this.rayBlur = mat(RAY_BLUR, { tIn: { value: null }, sunUv: { value: new THREE.Vector2() }, stepSize: { value: 0.03 } });
    // bloom
    this.down = mat(DOWN, { tIn: { value: null }, texel: { value: new THREE.Vector2() }, karis: { value: 0 } });
    this.up = mat(UP, { tIn: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } }, { blending: THREE.AdditiveBlending });
    this.lum = mat(LUM, { tIn: { value: null }, tPrev: { value: null }, rate: { value: 0.05 }, first: { value: 1 } });
    // final
    this.dirt = this.dirt || dirtTexture();
    this.final = mat(FINAL, {
      tScene: { value: this.sceneRT.texture }, tBloom: { value: this.mips[0].texture }, tRays: { value: this.rayA.texture }, tLum: { value: this.lumA.texture }, tDirt: { value: this.dirt },
      time: { value: 0 }, hurt: { value: 0 }, exposure: { value: 1 }, bloomMix: { value: 0.05 }, dirtAmt: { value: 0.1 }, rays: { value: 0 },
      vignette: { value: 0.3 }, grain: { value: 0.03 }, saturation: { value: 1 }, contrast: { value: 0.1 }, ca: { value: 0.012 },
      adaptKey: { value: 0.18 }, adaptMin: { value: 0.8 }, adaptMax: { value: 1.3 }, adaptOn: { value: 1 },
      tint: { value: new THREE.Color(1, 1, 1) }, rayColor: { value: new THREE.Color(1, 1, 1) }, shadowTint: { value: new THREE.Color(1, 1, 1) },
      highTint: { value: new THREE.Color(1, 1, 1) }, lift: { value: new THREE.Color(0, 0, 0) }, res: { value: new THREE.Vector2() },
    });
    this.fxaa = new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false, toneMapped: false });
    this.fxaa.vertexShader = VERT;
    this.fxaa.uniforms.tDiffuse.value = this.ldrRT.texture;
    this.setLook(this.look);
    this.resize(w, h);
  }

  resize(w, h) {
    if (!this.sceneRT) return;
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.W = W; this.H = H;
    this.sceneRT.setSize(W, H);
    this.ldrRT.setSize(W, H);
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
    this.aoRT.setSize(hw, hh); this.aoRT2.setSize(hw, hh);
    this.ssrRT.setSize(hw, hh);
    const qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);
    this.rayA.setSize(qw, qh); this.rayB.setSize(qw, qh);
    let mw = hw, mh = hh;
    for (const m of this.mips) { m.setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
    this.gtao.uniforms.resolution.value.set(hw, hh);
    this.ssr.uniforms.res.value.set(hw, hh);
    this.ssrApply.uniforms.texel.value.set(1 / hw, 1 / hh);
    this.final.uniforms.res.value.set(W, H);
    this.fxaa.uniforms.resolution.value.set(1 / W, 1 / H);
  }

  // look: per-map art direction (see maps.js theme.look)
  setLook(look = {}) {
    this.look = look;
    if (!this.final) return;
    const u = this.final.uniforms;
    u.bloomMix.value = look.bloom ?? 0.05;
    u.dirtAmt.value = look.dirt ?? 0.08;
    u.saturation.value = look.saturation ?? 1.0;
    u.contrast.value = look.contrast ?? 0.12;
    u.vignette.value = look.vignette ?? 0.3;
    u.grain.value = look.grain ?? 0.025;
    u.ca.value = look.ca ?? 0.012;
    u.tint.value.set(look.tint ?? 0xffffff);
    u.shadowTint.value.set(look.shadows ?? 0xffffff);
    u.highTint.value.set(look.highlights ?? 0xffffff);
    u.lift.value.set(look.lift ?? 0x000000);
    u.adaptKey.value = look.adaptKey ?? 0.18;
    u.adaptMin.value = look.adaptMin ?? 0.8;
    u.adaptMax.value = look.adaptMax ?? 1.35;
    u.adaptOn.value = look.adapt === false ? 0 : 1;
    this.aoApply.uniforms.aoTint.value.set(look.aoTint ?? 0x303848);
    this.firstLum = true;
  }

  render(dt, vm, hurt = 0) {
    const r = this.renderer;
    // count the whole frame (world + viewmodel + post passes) in renderer.info
    r.info.autoReset = false;
    r.info.reset();
    if (!this.sceneRT) {
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, this.camera);
      if (vm) { r.clearDepth(); r.render(vm.scene, vm.camera); }
      return;
    }
    this.time += dt;
    const cam = this.camera;
    cam.updateMatrixWorld();
    // ---- world ----
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, cam);
    for (const m of this.depthMats) {
      m.uniforms.uProj.value.copy(cam.projectionMatrix);
      m.uniforms.uProjInv.value.copy(cam.projectionMatrixInverse);
      m.uniforms.uNear.value = cam.near; m.uniforms.uFar.value = cam.far;
    }
    // ---- AO ----
    if (this.useAO && atmo.ao > 0) {
      const g = this.gtao.uniforms;
      g.cameraNear.value = cam.near; g.cameraFar.value = cam.far;
      g.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
      g.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      g.cameraWorldMatrix.value.copy(cam.matrixWorld);
      g.radius.value = atmo.aoRadius; g.thickness.value = 1.5; g.distanceExponent.value = 1.4; g.distanceFallOff.value = 1; g.scale.value = 1.9;
      r.setClearColor(0xffffff, 1);
      this.pass(this.gtao, this.aoRT, true);
      const b = this.aoBlur.uniforms;
      b.tAO.value = this.aoRT.texture; b.dir.value.set(1 / this.aoRT.width, 0); b.intensity.value = -1;
      this.pass(this.aoBlur, this.aoRT2);
      b.tAO.value = this.aoRT2.texture; b.dir.value.set(0, 1 / this.aoRT.height); b.intensity.value = atmo.ao;
      this.pass(this.aoBlur, this.aoRT);
      r.setClearColor(0x000000, 1);
      this.pass(this.aoApply, this.sceneRT);
    }
    // ---- SSR ----
    if (this.useSSR && atmo.ssr > 0) {
      this.upView.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
      this.ssr.uniforms.strength.value = atmo.ssr;
      r.setClearColor(0x000000, 0);
      this.pass(this.ssr, this.ssrRT, true);
      r.setClearColor(0x000000, 1);
      this.pass(this.ssrApply, this.sceneRT);
    }
    // ---- god rays ----
    let rayAmt = 0;
    if (this.useRays && atmo.rays > 0 && !atmo.indoor) {
      const facing = atmo.sunDir.dot(cam.getWorldDirection(this.v3b));
      const v = this.v3.copy(atmo.sunDir).multiplyScalar(500).add(cam.position);
      v.project(cam);
      const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
      const off = Math.max(0, Math.max(Math.abs(v.x), Math.abs(v.y)) - 1);
      rayAmt = atmo.rays * Math.max(0, facing) * Math.max(0, 1 - off * 1.2);
      if (rayAmt > 0.001) {
        const m = this.rayMask.uniforms;
        m.sunUv.value.set(sx, sy); m.aspect.value = this.W / this.H;
        this.pass(this.rayMask, this.rayA);
        const bl = this.rayBlur.uniforms;
        bl.sunUv.value.set(sx, sy);
        let src = this.rayA, dst = this.rayB;
        for (let i = 0; i < RAY_STEPS.length; i++) {
          bl.tIn.value = src.texture; bl.stepSize.value = RAY_STEPS[i];
          this.pass(this.rayBlur, dst);
          const t = src; src = dst; dst = t;
        }
        this.final.uniforms.tRays.value = src.texture;
      }
    }
    // ---- viewmodel ----
    if (vm) {
      r.setRenderTarget(this.sceneRT);
      r.clearDepth();
      r.render(vm.scene, vm.camera);
    }
    // ---- bloom ----
    let src = this.sceneRT;
    for (let i = 0; i < this.mips.length; i++) {
      const d = this.down.uniforms;
      d.tIn.value = src.texture; d.texel.value.set(1 / src.width, 1 / src.height); d.karis.value = i === 0 ? 1 : 0;
      this.pass(this.down, this.mips[i]);
      src = this.mips[i];
    }
    // eye adaptation from mip 4
    {
      const l = this.lum.uniforms;
      l.tIn.value = this.mips[4].texture; l.tPrev.value = this.lumA.texture;
      l.rate.value = 1 - Math.exp(-dt * 1.8); l.first.value = this.firstLum ? 1 : 0;
      this.pass(this.lum, this.lumB);
      const t = this.lumA; this.lumA = this.lumB; this.lumB = t;
      this.final.uniforms.tLum.value = this.lumA.texture;
      this.firstLum = false;
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const u = this.up.uniforms;
      u.tIn.value = this.mips[i].texture; u.texel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height); u.radius.value = 1;
      this.pass(this.up, this.mips[i - 1]);
    }
    // ---- final ----
    const f = this.final.uniforms;
    f.time.value = this.time;
    f.hurt.value += (hurt - f.hurt.value) * Math.min(1, dt * 6);
    f.exposure.value = r.toneMappingExposure;
    f.rays.value = rayAmt;
    f.rayColor.value.copy(atmo.sunColor);
    if (this.useFXAA) {
      this.pass(this.final, this.ldrRT);
      this.pass(this.fxaa, null);
    } else this.pass(this.final, null);
  }
}
