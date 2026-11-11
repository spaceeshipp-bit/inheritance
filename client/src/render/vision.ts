// Grandma's degraded eyesight, following shared/senses.ts visionBand():
// sharp <= 2 m, soft blur 2-6 m, heavy blur 6-10 m, beyond that shapes only.
// The scene renders into a half-float target with a depth texture, then a
// separable depth-dependent blur (a sample only spreads as far as its own blur
// radius, so sharp foreground never haloes onto a blurred background), then a
// grading pass (vignette, fade of colour with distance, Storm darkness).
import * as THREE from 'three';
import { SENSES, SPECTACLES, STORM } from '../../../shared/constants.js';
import { damp } from '../util.js';

export interface VisionParams {
  /** Distances (m): sharp up to, soft until, heavy until. */
  sharp: number;
  soft: number;
  heavy: number;
  /** Blur radii in pixels at 720p for the soft band end, heavy band end, and far. */
  rSoft: number;
  rHeavy: number;
  rFar: number;
  /** Minimum blur everywhere past ~1 m (spectacles knocked off). */
  rMin: number;
  vignette: number;
  /** 0..1 how much colour drains away with distance. */
  desat: number;
  /** 0..1 Storm darkness. */
  dark: number;
  /** 0..1 lightning flash. */
  flash: number;
}

export function visionParams(o: { specsActive: boolean; specsOff: boolean; dark: boolean; flash: boolean }): VisionParams {
  const base: VisionParams = {
    sharp: SENSES.clear, soft: SENSES.muffled, heavy: SENSES.mumble,
    rSoft: 3, rHeavy: 7.5, rFar: 11, rMin: 0, vignette: 0.55, desat: 0.65, dark: 0, flash: 0,
  };
  const specsOff: VisionParams = { ...base, sharp: 0.5, soft: SENSES.clear, heavy: SENSES.mumble, rMin: 4, rSoft: 5, rHeavy: 8.5, rFar: 12, desat: 0.8 };
  // A lightning flash lights the house like daylight (no better): her usual
  // eyesight for an instant, spectacles knocked off or not.
  if (o.flash) return { ...(o.specsOff ? specsOff : base), flash: 1 };
  // Power out: her candle shows faces within STORM.candleClear m and shapes to STORM.candleDim m.
  if (o.dark) return { ...base, sharp: 0.6, soft: STORM.candleClear, heavy: STORM.candleDim, rMin: 2, rSoft: 3, rHeavy: 7, rFar: 11, dark: 1, vignette: 0.75 };
  if (o.specsOff) return specsOff;
  if (o.specsActive) return { ...base, sharp: SPECTACLES.sharpRange, soft: SPECTACLES.sharpRange + 2, heavy: SPECTACLES.sharpRange + 5, rSoft: 2.5, rHeavy: 6, rFar: 9, vignette: 0.85, desat: 0.35 };
  return base;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMMON = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cNear;
uniform float cFar;
uniform float sharpD;
uniform float softD;
uniform float heavyD;
uniform float rSoft;
uniform float rHeavy;
uniform float rFar;
uniform float rMin;
uniform float pxScale;
varying vec2 vUv;

float viewDist(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, cNear, cFar);
}
/** Blur radius in full-resolution pixels for a point at view distance z. */
float coc(float z) {
  float r;
  if (z <= sharpD) r = 0.0;
  else if (z <= softD) r = rSoft * (z - sharpD) / max(0.001, softD - sharpD);
  else if (z <= heavyD) r = mix(rSoft, rHeavy, (z - softD) / max(0.001, heavyD - softD));
  else r = mix(rHeavy, rFar, clamp((z - heavyD) / 6.0, 0.0, 1.0));
  r = max(r, rMin * smoothstep(0.35, 1.3, z));
  return r * pxScale;
}
`;

/** Separable, depth-aware blur (runs at half resolution). */
const BLUR_FRAG = COMMON + /* glsl */ `
uniform sampler2D tColor;
uniform vec2 texel;
uniform vec2 dir;
void main() {
  float r0 = coc(viewDist(vUv));
  vec3 sum = texture2D(tColor, vUv).rgb;
  float wsum = 1.0;
  if (r0 > 0.25) {
    for (int i = 1; i <= 6; i++) {
      float fi = float(i);
      float o = fi / 6.0 * r0;
      float g = exp(-2.0 * fi * fi / 36.0);
      vec2 d = dir * texel * o;
      vec2 uvA = vUv + d;
      vec2 uvB = vUv - d;
      // A sample only counts if its own blur reaches this far: no sharp-foreground haloes.
      float wA = g * clamp(coc(viewDist(uvA)) / max(o, 0.001), 0.0, 1.0);
      float wB = g * clamp(coc(viewDist(uvB)) / max(o, 0.001), 0.0, 1.0);
      sum += texture2D(tColor, uvA).rgb * wA + texture2D(tColor, uvB).rgb * wB;
      wsum += wA + wB;
    }
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

/** Full-resolution composite: sharp where she sees sharply, blurred beyond; then grading. */
const COMPOSITE_FRAG = COMMON + /* glsl */ `
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform float vignette;
uniform float desat;
uniform float darkness;
uniform float flash;
void main() {
  float z0 = viewDist(vUv);
  float r0 = coc(z0);
  vec3 col = mix(texture2D(tSharp, vUv).rgb, texture2D(tBlur, vUv).rgb, smoothstep(0.4, 2.0, r0));
  // Colour drains with distance (her eyes): full colour while sharp, greyish past the heavy band.
  float far = smoothstep(sharpD, heavyD + 2.0, z0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum) * vec3(1.05, 0.98, 0.88), far * desat);
  // Vignette.
  vec2 q = vUv - 0.5;
  float v = smoothstep(0.25, 0.75, length(q * vec2(1.25, 1.0)));
  col *= 1.0 - v * vignette;
  // Storm darkness: her candle lights a few metres; beyond, faint silhouettes; lightning floods it.
  col *= mix(1.0, 0.78 * (1.0 - smoothstep(1.5, 4.0, z0)) + 0.12, darkness);
  col += vec3(0.55, 0.62, 0.8) * flash * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class GrandmaVision {
  private rtScene: THREE.WebGLRenderTarget;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private matBlur: THREE.ShaderMaterial;
  private matComp: THREE.ShaderMaterial;
  private cur: VisionParams | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rtScene = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.rtScene.depthTexture = new THREE.DepthTexture(size.x, size.y);
    const hw = Math.max(1, size.x >> 1), hh = Math.max(1, size.y >> 1);
    this.rtA = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false });
    const common = () => ({
      tDepth: { value: null as THREE.Texture | null },
      cNear: { value: 0.05 }, cFar: { value: 90 },
      sharpD: { value: 2 }, softD: { value: 6 }, heavyD: { value: 10 },
      rSoft: { value: 3 }, rHeavy: { value: 7 }, rFar: { value: 10 }, rMin: { value: 0 }, pxScale: { value: 1 },
    });
    this.matBlur = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { ...common(), tColor: { value: null }, texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, dir: { value: new THREE.Vector2(1, 0) } },
    });
    this.matComp = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { ...common(), tSharp: { value: null }, tBlur: { value: null }, vignette: { value: 0.5 }, desat: { value: 0.6 }, darkness: { value: 0 }, flash: { value: 0 } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matBlur);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(w: number, h: number): void {
    this.rtScene.setSize(w, h);
    this.rtA.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.rtB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.matBlur.uniforms.texel.value.set(1 / w, 1 / h);
    for (const m of [this.matBlur, this.matComp]) m.uniforms.pxScale.value = h / 720;
  }

  private pass(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** Render `scene` through Grandma's eyes. `target` params ease in over ~0.3 s. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, target: VisionParams, dt: number): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (size.x !== this.rtScene.width || size.y !== this.rtScene.height) this.setSize(size.x, size.y);
    if (!this.cur) this.cur = { ...target };
    const k = damp(target.flash > this.cur.flash ? 40 : 7, dt);
    for (const key of Object.keys(target) as (keyof VisionParams)[]) this.cur[key] += (target[key] - this.cur[key]) * k;
    const p = this.cur;
    for (const m of [this.matBlur, this.matComp]) {
      const u = m.uniforms;
      u.cNear.value = camera.near; u.cFar.value = camera.far;
      u.sharpD.value = p.sharp; u.softD.value = p.soft; u.heavyD.value = p.heavy;
      u.rSoft.value = p.rSoft; u.rHeavy.value = p.rHeavy; u.rFar.value = p.rFar; u.rMin.value = p.rMin;
      u.tDepth.value = this.rtScene.depthTexture;
    }
    const c = this.matComp.uniforms;
    c.vignette.value = p.vignette; c.desat.value = p.desat; c.darkness.value = p.dark; c.flash.value = p.flash;

    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(scene, camera);
    // Horizontal then vertical blur at half resolution.
    this.matBlur.uniforms.tColor.value = this.rtScene.texture;
    this.matBlur.uniforms.dir.value.set(1, 0);
    this.pass(this.matBlur, this.rtA);
    this.matBlur.uniforms.tColor.value = this.rtA.texture;
    this.matBlur.uniforms.dir.value.set(0, 1);
    this.pass(this.matBlur, this.rtB);
    c.tSharp.value = this.rtScene.texture;
    c.tBlur.value = this.rtB.texture;
    this.pass(this.matComp, null);
  }
}
