// The Three.js scene: manor, lights, characters, props, cameras, and Grandma's
// degraded-vision pipeline. One instance lives for the whole session.
import * as THREE from 'three';
import { COUSINS, type ItemKey } from '../../../shared/constants.js';
import { canIdentify, visionBand, type GrandmaSenseState, type VisionBand } from '../../../shared/senses.js';
import type { CharSnap, Role, Vec3, WishInfo } from '../../../shared/types.js';
import type { Quality } from '../settings.js';
import type { View } from '../state.js';
import { hashStr } from '../util.js';
import { CameraRig } from './camera.js';
import { CharacterModel, type Degrade } from './characters.js';
import { buildMap, type MapView } from './map.js';
import { PropViews } from './props.js';
import { GrandmaVision, visionParams } from './vision.js';

export interface MatchLook {
  grandmaId: string;
  cousins: { id: string; color: string; item: ItemKey }[];
}

export interface RenderFrame {
  view: View;
  selfId: string;
  role: Role | null;
  yaw: number;
  pitch: number;
  dt: number;
  time: number;
  dark: boolean;
  flash: boolean;
  wishKind: WishInfo['kind'] | null;
  found: Map<string, boolean>;
  level: (id: string) => number;
  /** Hide Grandma's cane view-model (parchment open, or not in a visit). */
  parchment: boolean;
  /** Reading / vote / results: a slow establishing shot, no Grandma filter. */
  cinematic?: boolean;
}

export interface ScreenPoint { x: number; y: number; onScreen: boolean; behind: boolean }

/** Map a vision band to how a character/prop is drawn for Grandma. */
export function degradeFor(b: VisionBand): Degrade {
  return b === 'sharp' || b === 'soft' ? 'none' : b === 'heavy' ? 'heavy' : 'shapes';
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private map: MapView;
  private props: PropViews;
  private vision: GrandmaVision;
  private models = new Map<string, CharacterModel>();
  private look: MatchLook | null = null;
  private lights: { light: THREE.Light; base: number; minor: boolean }[] = [];
  private lightning: THREE.DirectionalLight;
  private candle: THREE.PointLight;
  private ray = new THREE.Raycaster();
  private w = 1;
  private h = 1;
  private lastSense: GrandmaSenseState | null = null;
  private quality: Quality;
  /** Dynamic resolution ('auto'): fraction of the device pixel ratio actually rendered. */
  private resScale = 1;
  private frameMs = 16;
  private slowFor = 0;
  private fastFor = 0;

  constructor(private container: HTMLElement, quality: Quality = 'auto') {
    this.quality = quality;
    // MSAA is a creation-time choice: on for auto/high, off for the cheaper presets.
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === 'auto' || quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#120d0a');
    this.map = buildMap();
    this.scene.add(this.map.group);
    this.scene.add(this.rig.camera);
    this.props = new PropViews(this.scene);
    this.vision = new GrandmaVision(this.renderer);

    // Lights marked minor are switched off on the low preset (every point light
    // costs every lit pixel); the ambient fill is raised to make up for them.
    const add = (l: THREE.Light, minor = false) => { this.scene.add(l); this.lights.push({ light: l, base: l.intensity, minor }); };
    add(new THREE.HemisphereLight('#ffe9cc', '#4a3020', 1.1));
    add(new THREE.AmbientLight('#ffdcb0', 0.25));
    const point = (x: number, y: number, z: number, c: string, i: number, d: number, minor = false) => {
      const l = new THREE.PointLight(c, i, d, 1.4);
      l.position.set(x, y, z);
      add(l, minor);
    };
    point(0, 4.6, 0.5, '#ffc98a', 60, 22); // chandelier
    point(0, 4.2, 4.5, '#ffd29a', 25, 14, true); // by the front door
    point(-5, 2.6, 2.5, '#ffbf7a', 14, 8, true); // Grandma's lamp
    point(-4, 5, -10.5, '#ffcf96', 22, 11); // gallery sconces
    point(4, 5, -10.5, '#ffcf96', 22, 11, true);
    point(0, 2.4, -9.5, '#ffbf7a', 10, 8, true); // under the gallery
    point(12, 2.45, 0, '#fff0c8', 26, 12); // kitchen lamp
    point(14.5, 2.6, 4.5, '#fff0d8', 8, 5, true); // pantry bulb
    this.lightning = new THREE.DirectionalLight('#cfe0ff', 0);
    this.lightning.position.set(-20, 10, 0);
    this.scene.add(this.lightning);
    this.candle = new THREE.PointLight('#ffb070', 0, 6, 1.6);
    this.scene.add(this.candle);

    this.applyLightPreset();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Low preset: minor point lights off, ambient fill up. */
  private applyLightPreset(): void {
    const low = this.quality === 'low';
    for (const l of this.lights) {
      if (l.minor) l.light.visible = !low;
      if (l.light instanceof THREE.HemisphereLight || l.light instanceof THREE.AmbientLight) {
        l.base = (l.light instanceof THREE.HemisphereLight ? 1.1 : 0.25) * (low ? 1.45 : 1);
        l.light.intensity = l.base;
      }
    }
  }

  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
  get camera(): THREE.PerspectiveCamera { return this.rig.camera; }

  resize(): void {
    this.w = this.container.clientWidth || window.innerWidth;
    this.h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.w, this.h);
    this.rig.setAspect(this.w / this.h);
  }

  private pixelRatio(): number {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    switch (this.quality) {
      case 'high': return dpr;
      case 'medium': return 1;
      case 'low': return 0.5;
      default: return Math.max(0.5, dpr * this.resScale);
    }
  }

  /** Change quality live (MSAA only changes after a reload). */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.resScale = 1;
    this.applyLightPreset();
    this.resize();
  }

  /** The render resolution currently used, as a fraction of the CSS size (for the HUD/debug). */
  get renderScale(): number { return this.pixelRatio(); }

  /**
   * Dynamic resolution for 'auto': feed the real time between frames. Holds
   * about 40+ fps by stepping the render resolution down when frames are slow
   * for ~1.5 s, and back up when there is headroom for ~4 s.
   */
  adapt(frameMs: number): void {
    if (this.quality !== 'auto' || !(frameMs > 0) || frameMs > 1000) return;
    this.frameMs += (frameMs - this.frameMs) * 0.1;
    const dt = frameMs / 1000;
    if (this.frameMs > 25) { this.slowFor += dt; this.fastFor = 0; }
    else if (this.frameMs < 14) { this.fastFor += dt; this.slowFor = 0; }
    else { this.slowFor = 0; this.fastFor = 0; }
    const minScale = 0.5 / Math.min(window.devicePixelRatio || 1, 2);
    if (this.slowFor > 1.5 && this.resScale > minScale + 1e-3) {
      this.resScale = Math.max(minScale, this.resScale - 0.15);
      this.slowFor = 0;
      this.resize();
    } else if (this.fastFor > 4 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.1);
      this.fastFor = 0;
      this.resize();
    }
  }

  setMatch(look: MatchLook | null): void {
    this.look = look;
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.props.clear();
  }

  model(id: string): CharacterModel | undefined { return this.models.get(id); }

  private ensureModel(c: CharSnap): CharacterModel {
    let m = this.models.get(c.id);
    if (!m) {
      const info = this.look?.cousins.find((x) => x.id === c.id);
      const idx = this.look?.cousins.findIndex((x) => x.id === c.id) ?? -1;
      const fallback = COUSINS[Math.max(0, idx) % COUSINS.length];
      m = new CharacterModel({
        role: c.role,
        color: info?.color ?? fallback.color,
        item: c.role === 'cousin' ? (info?.item ?? fallback.key) : null,
        seed: hashStr(c.id),
      });
      m.root.userData.charId = c.id;
      m.root.traverse((o) => { o.userData.charId = c.id; });
      this.models.set(c.id, m);
      this.scene.add(m.root);
    }
    return m;
  }

  /** Grandma's cane swing (her own view-model or her body). */
  caneSwing(grandmaId: string, selfId: string): void {
    if (grandmaId === selfId) this.rig.swing();
    this.models.get(grandmaId)?.swing();
  }

  frame(f: RenderFrame): void {
    const { view, selfId, dt } = f;
    const isGrandma = f.role === 'grandma' && !f.cinematic;
    const g = view.grandma;
    const sense: GrandmaSenseState | null = g ? {
      pos: g.pos, yaw: g.yaw, aidActive: !!g.aidActive, specsActive: !!g.specsActive, specsOff: !!g.specsOff,
      dark: f.dark && !f.flash, flash: f.flash,
    } : null;
    if (isGrandma && sense && view.self) { sense.pos = view.self.pos; sense.yaw = f.yaw; }
    this.lastSense = sense;

    // Lights: Storm darkness and lightning.
    const level = f.dark && !f.flash ? 0.07 : 1;
    for (const l of this.lights) l.light.intensity = l.base * level;
    this.lightning.intensity = f.flash ? 4.5 : 0;
    this.map.windows.emissiveIntensity = f.dark ? (f.flash ? 3 : 0.05) : 0.9;
    this.candle.intensity = f.dark && !f.flash ? (isGrandma ? 3 : 6) : 0;

    // Characters.
    for (const [id, m] of this.models) if (!view.chars.has(id)) { m.dispose(); this.models.delete(id); }
    const itemProps = new Map<string, { heldBy: string | null; id: string }>();
    for (const p of view.props.values()) if (p.kind === 'item' && p.owner) itemProps.set(p.owner, { heldBy: p.heldBy, id: p.id });
    for (const c of view.chars.values()) {
      const m = this.ensureModel(c);
      const mine = c.id === selfId;
      // Hide yourself in first person, or when a wall pulls the orbit camera right up to your head.
      m.root.visible = !(mine && (isGrandma || (!f.cinematic && this.rig.boom < 1.1)));
      const ip = itemProps.get(c.id);
      const itemOnBody = !ip || (ip.heldBy === c.id && c.holding !== ip.id);
      const degrade: Degrade = isGrandma && sense && !mine ? degradeFor(visionBand(sense, c.pos)) : 'none';
      m.update(c, dt, { degrade, itemOnBody, mouth: f.level(mine ? 'self' : c.id), holding: !!c.holding });
    }

    // Props.
    this.props.update({
      props: view.props,
      chars: view.chars,
      models: this.models,
      itemKeyOf: (owner) => this.look?.cousins.find((c) => c.id === owner)?.item ?? null,
      degradeAt: (p: Vec3) => (isGrandma && sense ? degradeFor(visionBand(sense, p)) : 'none'),
      wishKind: f.wishKind,
      showWishMarker: !isGrandma,
      isGrandma,
      found: f.found,
      time: f.time,
      dt,
    });

    // Camera + render.
    const self = view.self;
    if (f.cinematic) {
      this.frameIdle(f.time, true);
    } else if (isGrandma) {
      const pos = self?.pos ?? g?.pos ?? { x: 0, y: 0, z: 0 };
      this.rig.updateGrandma(pos, f.yaw, f.pitch, dt, {
        specs: !!self?.specsActive && !self?.specsOff, down: self?.state === 'ragdoll', parchment: f.parchment,
      });
      this.candle.position.copy(this.rig.camera.position);
      this.scene.fog = this.grandmaFog(self, f);
      this.vision.render(this.scene, this.rig.camera, visionParams({
        specsActive: !!self?.specsActive, specsOff: !!self?.specsOff, dark: f.dark && !f.flash, flash: f.flash,
      }), dt);
    } else {
      const pos = self?.pos ?? { x: 0, y: 0, z: 3 };
      this.rig.updateCousin(pos, f.yaw, f.pitch, dt, this.map.blockers);
      this.candle.position.copy(this.rig.camera.position);
      this.scene.fog = f.dark && !f.flash ? this.cousinDarkFog : null;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.rig.camera);
    }
  }

  /** Title/lobby backdrop: a slow drift around the empty hall. */
  frameIdle(t: number, keepLights = false): void {
    if (!keepLights) {
      for (const l of this.lights) l.light.intensity = l.base;
      this.lightning.intensity = 0;
      this.candle.intensity = 0;
      this.map.windows.emissiveIntensity = 0.9;
    }
    this.scene.fog = null;
    const a = t * 0.05;
    const cam = this.rig.camera;
    if (Math.abs(cam.fov - 60) > 0.01) { cam.fov = 60; cam.updateProjectionMatrix(); }
    cam.position.set(Math.sin(a) * 5.5, 2.6 + Math.sin(t * 0.13) * 0.4, 2.5 + Math.cos(a) * 2.5);
    cam.lookAt(0, 2.2, -5);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, cam);
  }

  private cousinDarkFog = new THREE.Fog('#05040a', 2, 16);
  private fogCache = new Map<string, THREE.Fog>();
  private grandmaFog(self: CharSnap | null, f: RenderFrame): THREE.Fog {
    let key = 'normal';
    if (f.flash) key = 'flash';
    else if (f.dark) key = 'dark';
    else if (self?.specsOff) key = 'off';
    else if (self?.specsActive) key = 'specs';
    let fog = this.fogCache.get(key);
    if (!fog) {
      const p: Record<string, [string, number, number]> = {
        normal: ['#2a2119', 6, 22], specs: ['#2a2119', 10, 28], off: ['#2a2119', 2.5, 15], dark: ['#030305', 1.2, 8], flash: ['#9aa8c0', 9, 30],
      };
      const [c, n, fa] = p[key];
      fog = new THREE.Fog(c, n, fa);
      this.fogCache.set(key, fog);
    }
    return fog;
  }

  /** Project a world point to CSS pixels. */
  project(p: Vec3): ScreenPoint {
    const cam = this.rig.camera;
    const v = new THREE.Vector3(p.x, p.y, p.z);
    const toP = v.clone().sub(cam.position);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const behind = toP.dot(fwd) < 0;
    v.project(cam);
    const x = ((v.x + 1) / 2) * this.w;
    const y = ((1 - v.y) / 2) * this.h;
    const onScreen = !behind && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1;
    return { x, y, onScreen, behind };
  }

  /** World point above a character's head (for bubbles and tags). */
  headPos(id: string): Vec3 | null {
    const m = this.models.get(id);
    if (!m || !m.root.visible) return null;
    const v = m.headWorld(new THREE.Vector3());
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Camera yaw (radians) for screen-edge arrows. */
  cameraYaw(): number { return this.rig.camera.rotation.y; }

  /**
   * Grandma's crosshair target: the cousin under the screen centre, within
   * `maxDist` m and identifiable (her vision band lets her read the colour band).
   */
  pickCousin(selfId: string, grandmaId: string, maxDist = 10): string | null {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.rig.camera);
    this.ray.far = maxDist + 1;
    const roots: THREE.Object3D[] = [];
    for (const [id, m] of this.models) if (id !== selfId && id !== grandmaId && m.root.visible) roots.push(m.root);
    const blockers = this.ray.intersectObjects(this.map.blockers, false)[0]?.distance ?? Infinity;
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      if (h.distance > blockers) break;
      const id = h.object.userData.charId as string | undefined;
      if (!id) continue;
      const m = this.models.get(id);
      if (!m || !this.lastSense) return null;
      const pos = m.root.position;
      if (Math.hypot(pos.x - this.lastSense.pos.x, pos.z - this.lastSense.pos.z) > maxDist) return null;
      return canIdentify(this.lastSense, { x: pos.x, y: pos.y, z: pos.z }) ? id : null;
    }
    return null;
  }
}
