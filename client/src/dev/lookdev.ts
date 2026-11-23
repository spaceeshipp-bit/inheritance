// Look-dev (dev only, /lookdev.html): the game's real map and character models,
// posed as a family moment, rendered in candidate art directions so the owner
// can compare them before approving final graphics.
//
//   /lookdev.html?map=manor&look=current|storybook|cel|gorey&shot=family|hall|dinner
//
// window.__lookdev.ready turns true once a frame is drawn (for screenshots).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { COUSINS } from '../../../shared/constants.js';
import type { EmoteId } from '../../../shared/emotes.js';
import { insideMap, mapById, type MapId } from '../../../shared/map.js';
import { lineOfSight } from '../../../shared/sight.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { CharSnap, Vec3 } from '../../../shared/types.js';
import { buildMap } from '../render/map.js';
import { applyBakedLight } from '../render/baked.js';
import { CharacterModel } from '../render/characters.js';
import { HEIRLOOM_VARIANTS } from '../../../shared/map.js';
import { makeCat, makeHeirloom, makeShards, makeTeacup } from '../render/items.js';
import { AshPrints } from '../render/prints.js';
import type { AshPrint } from '../../../shared/protocol.js';

type Look = 'current' | 'storybook' | 'cel' | 'gorey';
const q = new URLSearchParams(location.search);
const look = (q.get('look') ?? 'current') as Look;
const mapId = (q.get('map') ?? 'manor') as MapId;
const shot = q.get('shot') ?? 'family';
const def = mapById(mapId);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const view = buildMap(mapId);
scene.add(view.group);
scene.background = new THREE.Color(view.background);
const hemi = new THREE.HemisphereLight('#ffe9cc', '#4a3020', 1.1);
const amb = new THREE.AmbientLight('#ffdcb0', 0.25);
scene.add(hemi, amb);
for (const { light } of view.lights) scene.add(light);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 200);

// ── The family moment ──
interface Pose { id: string; role: 'grandma' | 'cousin'; at: Vec3; face: Vec3 | number; emote?: EmoteId; t?: number; color?: string; item?: (typeof COUSINS)[number]['key'] }
const S = def.spawns;
const g0 = S.grandma;
const off = (dx: number, dz: number): Vec3 => ({ x: g0.x + dx, y: 0, z: g0.z + dz });
// A side-on tableau: Nana blows a kiss to the sweet one; around her, the rest of the family.
const DEAD_POSES: Pose[] = [
  { id: 'nana', role: 'grandma', at: off(1.2, -1.2), face: off(1.2, 0) },
  { id: 'agatha', role: 'cousin', at: off(2.5, -1.0), face: off(1.2, -1.2), emote: 'crocodile-tears', t: 1.2 },
  { id: 'barnaby', role: 'cousin', at: off(0.0, -2.2), face: off(1.2, -1.2), emote: 'grave-stomp', t: 0.35 },
  { id: 'clem', role: 'cousin', at: off(2.3, -2.5), face: off(1.2, -1.2), emote: 'coffin-measure', t: 0.9 },
  { id: 'dudley', role: 'cousin', at: off(-0.2, -0.4), face: off(1.2, -1.2), emote: 'money-count', t: 1.0 },
];
const MANOR_POSES: Pose[] = [
  { id: 'nana', role: 'grandma', at: off(0.8, -1.0), face: off(2.2, -2.3), emote: 'blow-kiss', t: 1.05 },
  { id: 'agatha', role: 'cousin', at: off(2.2, -2.3), face: off(0.8, -1.0), emote: 'heart-hands', t: 1.1 },
  { id: 'barnaby', role: 'cousin', at: off(-0.4, -2.3), face: off(0.8, -1.0), emote: 'the-bird', t: 1.0 },
  { id: 'clem', role: 'cousin', at: off(1.9, -2.9), face: off(2.9, -4.7), emote: 'moon', t: 1.3 },
  { id: 'dudley', role: 'cousin', at: off(-0.8, -0.5), face: off(0.8, -1.0), emote: 'coffin-measure', t: 0.9 },
  { id: 'edna', role: 'cousin', at: off(4.0, -4.9), face: off(0.8, -1.0), emote: 'grave-stomp', t: 0.35 },
];
// Any other map: Nana at her spawn facing her family on their spawns, each mid-gesture.
const centroid = (ps: Vec3[]): Vec3 => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: 0, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
const fam = S.cousins.slice(0, 6);
const famC = centroid(fam);
const EMOS: EmoteId[] = ['heart-hands', 'the-bird', 'moon', 'coffin-measure', 'grave-stomp', 'raspberry'];
const GENERIC_POSES: Pose[] = [
  { id: 'nana', role: 'grandma', at: g0, face: famC, emote: 'cane-shake', t: 0.8 },
  ...fam.map((p, i): Pose => ({
    id: `c${i}`, role: 'cousin', at: p,
    face: EMOS[i] === 'moon' ? { x: 2 * p.x - g0.x, y: 0, z: 2 * p.z - g0.z } : g0, emote: EMOS[i], t: EMOS[i] === 'grave-stomp' ? 0.35 : 1.0,
  })),
];
// 'bake': the map alone (for baking its lightmap); no family, no props.
const POSES: Pose[] = shot === 'dinner' || shot === 'bake' ? [] : shot === 'dead' && mapId === 'manor' ? DEAD_POSES : mapId === 'manor' ? MANOR_POSES : GENERIC_POSES;
const models: CharacterModel[] = [];
// 'ash': Grandpa's urn broken on the floor, and a trail of grey footprints leading to one of the family.
const ASHY = mapId === 'manor' ? 'dudley' : 'c3';
POSES.forEach((p, i) => {
  const cz = COUSINS[i % COUSINS.length];
  const m = new CharacterModel({ role: p.role, color: p.color ?? cz.color, item: p.role === 'cousin' ? cz.key : null, seed: 7 + i * 31 });
  scene.add(m.root);
  const yaw = typeof p.face === 'number' ? p.face : Math.atan2(-(p.face.x - p.at.x), -(p.face.z - p.at.z));
  const snap = (t: number): CharSnap => ({
    id: p.id, role: p.role, pos: p.at, yaw, pitch: 0, vel: { x: 0, y: 0, z: 0 }, state: 'normal', ragdollT: 0, holding: null,
    running: false, sneaking: false, whispering: false, charge: 0, plant: 0, leader: i === 1,
    ...(p.emote ? { emote: p.emote, emoteT: t } : {}),
    ...(shot === 'ash' && p.id === ASHY ? { ashy: true } : {}),
    // 'dead': Nana playing dead, the family round her "body".
    ...(shot === 'dead' && p.role === 'grandma' ? { dead: true } : {}),
  });
  // Let the springs settle into the pose over a second.
  const T = p.t ?? 1;
  for (let k = 0; k < 90; k++) m.update(snap(Math.max(0, T - (90 - k) / 60)), 1 / 60, { degrade: 'none', itemOnBody: true, mouth: 0, holding: false });
  models.push(m);
});

// Heirlooms on the pedestals, the cat, the teacup.
if (shot !== 'bake') {
  def.heirloomSpots.slice(0, 8).forEach((s, i) => {
    const h = makeHeirloom(HEIRLOOM_VARIANTS[i % HEIRLOOM_VARIANTS.length]);
    h.position.set(s.x, s.y, s.z);
    scene.add(h);
  });
  const cat = makeCat();
  cat.group.position.set(S.cat.x, S.cat.y, S.cat.z);
  scene.add(cat.group);
  const cup = makeTeacup();
  cup.position.set(S.teacup.x, S.teacup.y, S.teacup.z);
  scene.add(cup);
}

if (shot === 'ash') {
  const who = POSES.find((p) => p.id === ASHY) ?? POSES[POSES.length - 1];
  const pile = mapId === 'manor' ? off(3.6, 0.2) : { x: who.at.x + 3, y: 0, z: who.at.z + 1 };
  const urn = makeShards('urn', 7);
  urn.position.set(pile.x, 0, pile.z);
  scene.add(urn);
  const prints: AshPrint[] = [];
  const dx = who.at.x - pile.x, dz = who.at.z - pile.z, L = Math.hypot(dx, dz);
  const n = Math.min(16, Math.floor(L / 0.6));
  for (let k = 1; k <= n; k++) {
    const f = (k * 0.6) / L;
    const wob = Math.sin(k * 0.7) * 0.15;
    prints.push({ x: pile.x + dx * f - (dz / L) * wob, y: 0, z: pile.z + dz * f + (dx / L) * wob, yaw: Math.atan2(-dx, -dz), side: (k % 2) as 0 | 1, t: k });
  }
  new AshPrints(scene).update(prints, 1);
}

// ── Shots ──
const g = off(1.2, -1.0);
if (shot === 'hall') {
  camera.position.set(view.idle.center.x + 5, 3.2, view.idle.center.z + 3);
  camera.lookAt(view.idle.look.x, 1.2, view.idle.look.z);
} else if (shot === 'dinner') {
  const t = def.dinner.table;
  const c = { x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 };
  camera.position.set(c.x + 2.8, 2.4, c.z + 2.8);
  camera.lookAt(c.x, 0.8, c.z);
} else if (shot === 'overview') {
  // A cut-away from above, as tests/e2e/mapshots.ts takes it.
  const b = def.bounds;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
  camera.position.set(cx + w * 0.1, Math.max(w, d) * 0.85, b.max.z + d * 0.45);
  camera.lookAt(cx, 0, cz);
  camera.fov = 50;
} else if (shot === 'dead' && mapId === 'manor') {
  camera.position.set(g0.x + 4.8, 2.3, g0.z + 1.6);
  camera.lookAt(g0.x + 1.2, 0.4, g0.z - 1.2);
  camera.fov = 55;
} else if (shot === 'ash' && mapId === 'manor') {
  // From above the trail, looking down it to whoever left it.
  camera.position.set(g0.x + 4.6, 2.6, g0.z + 1.9);
  camera.lookAt(g0.x + 1.0, 0.2, g0.z - 0.4);
  camera.fov = 55;
} else if (mapId === 'manor') {
  // From the east side of the room, looking across at the family.
  camera.position.set(g0.x + 6.2, 2.2, g0.z + 0.2);
  camera.lookAt(g0.x + 1.2, 0.9, g0.z - 1.4);
  camera.fov = 55;
} else {
  // Side-on to the line between Nana and her family, from whichever side is inside the house with a clear view.
  const mid = { x: (g0.x + famC.x) / 2, y: 0, z: (g0.z + famC.z) / 2 };
  const dx = famC.x - g0.x, dz = famC.z - g0.z, L = Math.hypot(dx, dz) || 1;
  const side = { x: -dz / L, z: dx / L };
  // Score each candidate by how many of the family it can see (chest height, nothing in the way), then by distance near 5 m.
  let best: Vec3 | null = null, bestScore = -Infinity;
  for (const dist of [7, 6, 5, 4, 3.2]) {
    for (const s of [1, -1]) {
      for (const back of [0, 1.5, -1.5, 3]) {
        for (const yy of [1.7, 2.3]) {
          const p = { x: mid.x + side.x * s * dist + (dx / L) * back, y: yy, z: mid.z + side.z * s * dist + (dz / L) * back };
          if (!insideMap(p, def, -0.4)) continue;
          const seen = POSES.filter((q) => lineOfSight(p, { x: q.at.x, y: 1.2, z: q.at.z })).length;
          const score = seen * 10 - Math.abs(dist - 5) - (yy > 2 ? 0.5 : 0);
          if (score > bestScore) { bestScore = score; best = p; }
        }
      }
    }
  }
  const p = best ?? { x: mid.x + side.x * 3, y: 2.0, z: mid.z + side.z * 3 };
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(mid.x, 0.95, mid.z);
  camera.fov = 58;
}
camera.updateProjectionMatrix();

// ── Looks ──
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, sat: { value: 1 }, contrast: { value: 1 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) },
    tint: { value: new THREE.Vector3(1, 1, 1) }, tintMix: { value: 0 }, vignette: { value: 0 }, grain: { value: 0 }, time: { value: 0 }, levels: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float sat, contrast, tintMix, vignette, grain, time, levels; uniform vec3 lift, gain, tint; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c = c * gain + lift * (1.0 - c);
      c = mix(c, l * tint, tintMix);
      if (levels > 0.0) c = floor(c * levels + 0.5) / levels;
      vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 2.2;
      c += (rnd(vUv * 731.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

function shadows(on: boolean): void {
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = on && !(o.material as THREE.Material).transparent; o.receiveShadow = on; } });
}

let draw: () => void = () => renderer.render(scene, camera);

if (look === 'storybook') {
  // Wes Anderson by way of Aardman: soft key light with real shadows, ambient occlusion
  // in every corner, a warm pastel grade, a little glow on the lamps, a soft vignette.
  const key = new THREE.SpotLight('#ffe2b8', 140, 30, 0.75, 0.6, 1.4);
  key.position.set(g.x + 2.5, 5.2, g.z + 3.5);
  key.target.position.set(g.x, 0, g.z - 0.5);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  key.castShadow = true;
  scene.add(key, key.target);
  hemi.intensity = 0.8;
  renderer.toneMappingExposure = 0.92;
  shadows(true);
  const comp = new EffectComposer(renderer);
  comp.addPass(new RenderPass(scene, camera));
  if (q.get('ao') !== 'off') {
    const ao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.kernelRadius = 0.35;
    ao.minDistance = 0.0008;
    ao.maxDistance = 0.06;
    comp.addPass(ao);
  }
  comp.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.5, 0.92));
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.sat.value = 0.92;
  grade.uniforms.contrast.value = 1.06;
  grade.uniforms.lift.value.set(0.05, 0.03, 0.06);
  grade.uniforms.gain.value.set(1.03, 1.0, 0.94);
  grade.uniforms.vignette.value = 0.55;
  grade.uniforms.grain.value = 0.02;
  comp.addPass(grade);
  draw = () => comp.render();
} else if (look === 'cel') {
  // Overcooked / Untitled Goose Game: three-tone toon shading, ink outlines, bright and flat.
  const steps = new Uint8Array([90, 170, 255]);
  const grad = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const toon = new Map<THREE.Material, THREE.Material>();
  const swap = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial)) return m;
    let t = toon.get(m);
    if (!t) {
      t = new THREE.MeshToonMaterial({ color: m.color, map: m.map, gradientMap: grad, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side });
      toon.set(m, t);
    }
    return t;
  };
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    if (o.userData.mat) o.userData.mat = swap(o.userData.mat);
  });
  hemi.intensity = 1.6;
  const sun = new THREE.DirectionalLight('#fff3dd', 1.6);
  sun.position.set(g.x + 6, 10, g.z + 8);
  scene.add(sun);
  renderer.toneMapping = THREE.NoToneMapping;
  const fx = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: [0.1, 0.06, 0.04] });
  draw = () => fx.render(scene, camera);
} else if (look === 'gorey') {
  // Edward Gorey at midnight: cold moonlight through the windows, one warm candle,
  // ink-and-sepia grade, heavy vignette, paper grain, a little fog.
  for (const { light } of view.lights) light.intensity *= 0.18;
  hemi.intensity = 0.25; amb.intensity = 0.1;
  const moon = new THREE.DirectionalLight('#9fb8ff', 2.6);
  moon.position.set(view.lightningFrom.x, view.lightningFrom.y + 4, view.lightningFrom.z + 3);
  moon.target.position.set(g.x, 0, g.z);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const s = moon.shadow.camera as THREE.OrthographicCamera;
  s.left = -14; s.right = 14; s.top = 14; s.bottom = -14; s.far = 60;
  scene.add(moon, moon.target);
  const candle = new THREE.PointLight('#ffb067', 9, 7, 1.6);
  candle.position.set(g.x - 0.6, 1.5, g.z + 0.9);
  scene.add(candle);
  scene.fog = new THREE.Fog('#0d0b12', 6, 22);
  shadows(true);
  const comp = new EffectComposer(renderer);
  comp.addPass(new RenderPass(scene, camera));
  comp.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.5, 0.7));
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.sat.value = 0.35;
  grade.uniforms.contrast.value = 1.25;
  grade.uniforms.tint.value.set(1.05, 0.93, 0.78);
  grade.uniforms.tintMix.value = 0.45;
  grade.uniforms.vignette.value = 1.4;
  grade.uniforms.grain.value = 0.06;
  comp.addPass(grade);
  draw = () => comp.render();
}

// ?baked=1: the map's baked lightmap, as the game would apply it.
if (q.get('baked') === '1') {
  await applyBakedLight(view);
  view.lightLevel?.(1);
}

let frames = 0;
const w = window as unknown as { __lookdev: { ready: boolean; look: string; exportGlb: () => Promise<string>; camera: () => unknown; lightmap: unknown } };
w.__lookdev = { ready: false, look, exportGlb, camera: cameraInfo, lightmap: view.lightmap ?? null };

/** The camera as the offline renderer wants it: where, looking at what, vertical field of view. */
function cameraInfo(): { pos: number[]; look: number[]; fov: number; aspect: number } {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const look = camera.position.clone().add(dir.multiplyScalar(10));
  return { pos: camera.position.toArray(), look: look.toArray(), fov: camera.fov, aspect: camera.aspect };
}

/**
 * The scene as a binary glTF (base64), for rendering offline in Blender's
 * Cycles (tests/e2e/renders/): sprites (floating hearts) are left out.
 */
async function exportGlb(): Promise<string> {
  const sprites: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o instanceof THREE.Sprite || (o as THREE.Object3D).type === 'Sprite') sprites.push(o); });
  const parents = sprites.map((o) => o.parent);
  for (const o of sprites) o.removeFromParent();
  try {
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    const bytes = new Uint8Array(glb as ArrayBuffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } finally {
    sprites.forEach((o, i) => parents[i]?.add(o));
  }
}
// The scene is still: a few frames (for the post passes' history), then stop drawing.
function loop(): void {
  draw();
  if (++frames >= 4) { w.__lookdev.ready = true; return; }
  requestAnimationFrame(loop);
}
loop();
