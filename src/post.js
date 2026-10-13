// Post-processing chain: world + viewmodel → bloom → tone map → grade (contrast,
// vignette, grain, damage desaturation) → FXAA.
import * as THREE from 'three';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../lib/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from '../lib/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 }, vignette: { value: 0.35 },
    grain: { value: 0.035 }, saturation: { value: 1.08 }, contrast: { value: 1.06 }, tint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, hurt, vignette, grain, saturation, contrast; uniform vec3 tint; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      // slight chromatic fringe toward the edges, stronger when hurt
      float ca = (0.0015 + hurt * 0.004) * dot(d, d) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation * (1.0 - hurt * 0.75));
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;
      float v = smoothstep(0.85, 0.2, length(d) * (1.0 + vignette));
      col *= mix(1.0, v, vignette + hurt * 0.4);
      col += (rand(uv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene; this.camera = camera;
    this.quality = null;
    this.time = 0;
  }

  setQuality(q, w, h) {
    if (q === this.quality && this.composer) return;
    this.quality = q;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (q === 'low') return;
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    const c = this.composer = new EffectComposer(r, rt);
    this.worldPass = new RenderPass(this.scene, this.camera);
    c.addPass(this.worldPass);
    this.vmPass = new RenderPass(this.scene, this.camera);
    this.vmPass.clear = false; this.vmPass.clearDepth = true; this.vmPass.enabled = false;
    c.addPass(this.vmPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.88);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.enabled = q !== 'high';
    c.addPass(this.fxaa);
    this.resize(w, h);
  }

  resize(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  // look: { bloom, exposure, saturation, contrast, tint }
  setLook(look = {}) {
    if (!this.composer) return;
    this.bloom.strength = look.bloom ?? 0.55;
    this.bloom.threshold = look.threshold ?? 0.88;
    const u = this.grade.material.uniforms;
    u.saturation.value = look.saturation ?? 1.08;
    u.contrast.value = look.contrast ?? 1.06;
    u.tint.value.set(look.tint ?? 0xffffff);
  }

  render(dt, vm, hurt = 0) {
    const r = this.renderer;
    if (!this.composer) {
      r.clear();
      r.render(this.scene, this.camera);
      if (vm) { r.clearDepth(); r.render(vm.scene, vm.camera); }
      return;
    }
    this.time += dt;
    this.vmPass.enabled = !!vm;
    if (vm) { this.vmPass.scene = vm.scene; this.vmPass.camera = vm.camera; }
    const u = this.grade.material.uniforms;
    u.time.value = this.time;
    u.hurt.value += (hurt - u.hurt.value) * Math.min(1, dt * 6);
    this.composer.render(dt);
  }
}
