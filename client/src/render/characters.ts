// Characters built from primitives: torso, head, arms, legs, a colour sash and
// headband in the cousin's colour, the signature item on their back. Grandma is
// bigger, in a long dress and shawl, with spectacles and a cane.
// Limbs are driven by damped springs: stiff while walking (procedural gait),
// loose with random targets while ragdolled (floppy), and the whole body
// tumbles in the direction of travel.
import * as THREE from 'three';
import type { ItemKey } from '../../../shared/constants.js';
import type { CharSnap } from '../../../shared/types.js';
import { clamp, damp, rng } from '../util.js';
import { bandPatternIndex, bandPatternTexture, blobMaterial, boxGeo, mat } from './materials.js';
import { makeItem } from './items.js';

export type Degrade = 'none' | 'heavy' | 'shapes';

export interface CharLook {
  role: 'cousin' | 'grandma';
  color: string;
  item: ItemKey | null;
  seed: number;
}

export interface CharFrame {
  degrade: Degrade;
  /** Show the signature item on the body (not stolen, not in hands, readable). */
  itemOnBody: boolean;
  /** Voice level 0..1 for the mouth. */
  mouth: number;
  holding: boolean;
  /**
   * The viewing camera's world position. A body closer than ~0.5 m to it fades
   * out, so a crowd around Grandma never fills her first-person view (review P13).
   */
  cam?: THREE.Vector3;
}

/** Seconds of the shove gesture (wind back, then both arms thrust forward). */
const PUSH_TIME = 0.38;
/** Shove gestures cued by the HUD (character id -> cue time, ms). */
const pushCues = new Map<string, number>();
/**
 * Play the shove gesture on a character: your own on every shove press (hit or
 * miss), anyone else's when their shove lands (review P12).
 */
export function cuePush(id: string): void {
  if (id) pushCues.set(id, performance.now());
}

/** Draw each cousin's band pattern on their sash (settings: colour-band patterns). */
let bandPatterns = true;
export function setBandPatterns(on: boolean): void { bandPatterns = on; }

interface Joint { obj: THREE.Object3D; rx: number; rz: number; vx: number; vz: number; tx: number; tz: number }
type JointName = 'armL' | 'armR' | 'legL' | 'legR' | 'head';

const SKINS = ['#f1c9a5', '#d9a27a', '#b9805a', '#8d5a3a', '#f5d6c0', '#c48e66'];
const HAIRS = ['#2b1d14', '#6b3e1f', '#c9a25a', '#1a1a1a', '#8a3a1a', '#4a3a2a'];
const SHIRTS = ['#d9d4cc', '#5a5f6a', '#3d3a36', '#7a6a58', '#a8a29a', '#4a5560'];

const greyMat = new THREE.MeshStandardMaterial({ color: '#7a7672', roughness: 1 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#3b3835', roughness: 1 });

export class CharacterModel {
  readonly root = new THREE.Group();
  readonly scale: number;
  readonly look: CharLook;
  private yawG = new THREE.Group();
  private tumbleG = new THREE.Group();
  private leanG = new THREE.Group();
  private joints = {} as Record<JointName, Joint>;
  private meshes: THREE.Mesh[] = [];
  private item: THREE.Object3D | null = null;
  private shadow: THREE.Mesh;
  private halo: THREE.Mesh;
  private mouthMesh!: THREE.Mesh;
  private specs: THREE.Object3D | null = null;
  private hipH: number;
  private walkPhase = 0;
  private theta = 0;
  private thetaVel = 0;
  private thetaTarget = 0;
  private axis = new THREE.Vector3(1, 0, 0);
  private wasRagdoll = false;
  private wasSleeping = false;
  private degrade: Degrade = 'none';
  private flopTimer = 0;
  private swingT = 0;
  private pushT = 0;
  private rand: () => number;
  private headTop = new THREE.Object3D();
  /** The sash and belt: plain colour, or colour plus the cousin's pattern. */
  private bandMeshes: THREE.Mesh[] = [];
  private bandPlain: THREE.Material | null = null;
  private bandPatterned: THREE.Material | null = null;
  private patternsShown: boolean | null = null;
  /** Near-camera fade: current opacity and per-material transparent copies. */
  private fade = 1;
  private fadeMats = new Map<THREE.Material, THREE.Material>();

  constructor(look: CharLook) {
    this.look = look;
    this.rand = rng(look.seed);
    const g = look.role === 'grandma';
    this.scale = g ? 1.12 : 1;
    this.hipH = g ? 0.86 : 0.9;
    this.root.add(this.yawG);
    this.yawG.add(this.tumbleG);
    this.tumbleG.add(this.leanG);
    this.tumbleG.position.y = this.hipH;
    this.yawG.scale.setScalar(this.scale);
    this.build();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMaterial());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.scale.setScalar(0.95 * this.scale);
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), mat('#ffd75a', { emissive: '#ffcc33', emissiveIntensity: 1.5 }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 0.48;
    this.joints.head.obj.add(this.halo);
    this.joints.head.obj.add(this.headTop);
    this.headTop.position.y = 0.55;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== this.shadow) {
        o.userData.mat = o.material;
        this.meshes.push(o);
      }
    });
  }

  private part(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private joint(name: JointName, x: number, y: number, z: number): THREE.Group {
    const o = new THREE.Group();
    o.position.set(x, y, z);
    this.leanG.add(o);
    this.joints[name] = { obj: o, rx: 0, rz: 0, vx: 0, vz: 0, tx: 0, tz: 0 };
    return o;
  }

  private build(): void {
    const g = this.look.role === 'grandma';
    const r = this.rand;
    const skin = mat(SKINS[Math.floor(r() * SKINS.length)], { rough: 0.7 });
    const band = mat(this.look.color, { rough: 0.55, emissive: this.look.color, emissiveIntensity: 0.18 });
    const shirt = mat(g ? '#5b3a5e' : SHIRTS[Math.floor(r() * SHIRTS.length)], { rough: 0.85 });
    const trousers = mat(g ? '#3a2438' : ['#2c3440', '#3b3128', '#26262a', '#4a4038'][Math.floor(r() * 4)], { rough: 0.9 });
    const shoes = mat('#1d1712', { rough: 0.6 });
    const hair = mat(g ? '#d8d6d2' : HAIRS[Math.floor(r() * HAIRS.length)], { rough: 0.95 });
    const L = this.leanG;

    // Legs (pivot at the hip).
    for (const s of [-1, 1]) {
      const leg = this.joint(s < 0 ? 'legL' : 'legR', s * 0.12, 0, 0);
      this.part(leg, new THREE.CapsuleGeometry(0.075, g ? 0.62 : 0.68, 4, 8), trousers, 0, -0.42, 0);
      this.part(leg, new THREE.BoxGeometry(0.13, 0.08, 0.25), shoes, 0, -this.hipH + 0.04, -0.05);
    }
    // Hips + torso.
    this.part(L, new THREE.BoxGeometry(0.38, 0.18, 0.24), trousers, 0, 0.03, 0);
    const torso = this.part(L, new THREE.CapsuleGeometry(0.21, 0.3, 6, 12), shirt, 0, 0.34, 0);
    torso.scale.set(g ? 1.2 : 1.1, 1, g ? 0.85 : 0.72);
    if (g) {
      // Long dress, shawl and pearls.
      this.part(L, new THREE.CylinderGeometry(0.22, 0.42, 0.78, 18), shirt, 0, -0.4, 0);
      const shawl = this.part(L, new THREE.CylinderGeometry(0.25, 0.31, 0.22, 18, 1, true), mat('#b9a3c9', { rough: 1, }), 0, 0.5, 0);
      (shawl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const pearls = this.part(L, new THREE.TorusGeometry(0.11, 0.018, 6, 18), mat('#f4f0ea', { rough: 0.2 }), 0, 0.6, -0.03);
      pearls.rotation.x = Math.PI / 2 - 0.3;
    } else {
      // The colour sash, diagonally across the chest and back, and a belt: the
      // band's pattern (one texture repeat per sash width) tells cousins apart
      // without relying on colour alone.
      const sash = this.part(L, boxGeo(0.11, 0.8, 0.335, 0.11), band, 0, 0.33, 0);
      sash.rotation.z = 0.72;
      const belt = this.part(L, boxGeo(0.4, 0.07, 0.25, 0.11), band, 0, 0.12, 0);
      this.bandMeshes.push(sash, belt);
      this.bandPlain = band;
      const pi = bandPatternIndex(this.look.item);
      this.bandPatterned = pi >= 0
        ? mat(this.look.color, { rough: 0.55, emissive: this.look.color, emissiveIntensity: 0.12, map: bandPatternTexture(pi) })
        : band;
    }
    // Arms (pivot at the shoulder).
    for (const s of [-1, 1]) {
      const arm = this.joint(s < 0 ? 'armL' : 'armR', s * (g ? 0.31 : 0.29), 0.56, 0);
      this.part(arm, new THREE.CapsuleGeometry(0.062, 0.42, 4, 8), shirt, 0, -0.26, 0);
      this.part(arm, new THREE.SphereGeometry(0.07, 10, 8), skin, 0, -0.53, 0);
      if (g && s > 0) {
        // The cane, held in the right hand.
        const caneM = mat('#3b2414', { rough: 0.4 });
        this.part(arm, new THREE.CylinderGeometry(0.022, 0.022, 0.92, 8), caneM, 0, -1.0, -0.06);
        const crook = this.part(arm, new THREE.TorusGeometry(0.06, 0.022, 6, 12, Math.PI), caneM, 0, -0.54, -0.0);
        crook.rotation.y = Math.PI / 2;
      }
    }
    // Head (pivot at the neck).
    const head = this.joint('head', 0, 0.63, 0);
    this.part(head, new THREE.SphereGeometry(0.17, 18, 14), skin, 0, 0.17, 0);
    this.part(head, new THREE.SphereGeometry(0.03, 8, 6), skin, 0, 0.15, -0.17);
    for (const s of [-1, 1]) this.part(head, new THREE.SphereGeometry(0.024, 8, 6), mat('#1a1410'), s * 0.062, 0.2, -0.152);
    this.mouthMesh = this.part(head, new THREE.BoxGeometry(0.075, 0.018, 0.02), mat('#5a1e1e'), 0, 0.09, -0.158);
    const cap = this.part(head, new THREE.SphereGeometry(0.182, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.18, 0.012);
    cap.rotation.x = -0.25;
    if (g) {
      this.part(head, new THREE.SphereGeometry(0.1, 12, 10), hair, 0, 0.3, 0.13);
      const specs = new THREE.Group();
      const rim = mat('#c9a24a', { metal: 0.8, rough: 0.3 });
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 6, 16), rim);
        lens.position.set(s * 0.063, 0.2, -0.17);
        specs.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), rim);
      bridge.position.set(0, 0.205, -0.172);
      specs.add(bridge);
      head.add(specs);
      this.specs = specs;
    } else {
      // Headband in the cousin's colour, readable from behind.
      const hb = this.part(head, new THREE.TorusGeometry(0.172, 0.032, 8, 24), band, 0, 0.22, 0);
      hb.rotation.x = Math.PI / 2 + 0.12;
    }
    // Signature item, worn on the back.
    if (this.look.item) {
      const it = makeItem(this.look.item);
      it.position.set(0, 0.22, 0.2);
      it.rotation.set(0.15, Math.PI, 0);
      it.scale.setScalar(this.look.item === 'ring' ? 1.4 : 1.05);
      L.add(it);
      this.item = it;
    }
  }

  /** World position just above the head (for bubbles and name tags). */
  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.headTop.getWorldPosition(out);
  }

  /** Where a held prop sits (world). */
  holdPoint(c: CharSnap, out: THREE.Vector3): THREE.Vector3 {
    const s = this.scale;
    const local = c.charge > 0 ? new THREE.Vector3(0.28, 1.5, 0.08) : new THREE.Vector3(0, 0.95, -0.46);
    local.multiplyScalar(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yawG.rotation.y);
    return out.copy(this.root.position).add(local);
  }

  /** Grandma's cane whack animation. */
  swing(): void { this.swingT = 0.35; }

  setDegrade(d: Degrade): void {
    if (d === this.degrade) return;
    this.degrade = d;
    this.applyMaterials();
  }

  /** The material a mesh shows before any fade: its own, or Grandma's grey/dark degraded look. */
  private baseMaterial(m: THREE.Mesh): THREE.Material {
    return this.degrade === 'none' ? (m.userData.mat as THREE.Material) : this.degrade === 'heavy' ? greyMat : darkMat;
  }

  /** Put the right material on every mesh for the current degrade, pattern and fade. */
  private applyMaterials(): void {
    for (const m of this.meshes) {
      const base = this.baseMaterial(m);
      if (this.fade >= 0.999) { m.material = base; continue; }
      let faded = this.fadeMats.get(base);
      if (!faded) {
        faded = base.clone();
        faded.transparent = true;
        faded.depthWrite = false;
        this.fadeMats.set(base, faded);
      }
      faded.opacity = this.fade;
      m.material = faded;
    }
  }

  /** Swap the sash between plain colour and colour + pattern when the setting changes. */
  private syncPatterns(): void {
    if (this.patternsShown === bandPatterns || !this.bandPlain || !this.bandPatterned) return;
    this.patternsShown = bandPatterns;
    const use = bandPatterns ? this.bandPatterned : this.bandPlain;
    for (const m of this.bandMeshes) m.userData.mat = use;
    this.applyMaterials();
  }

  /** Opacity for a body this close to the camera: fully drawn from 0.5 m out, a ghost when touching. */
  private fadeFor(c: CharSnap, cam: THREE.Vector3 | undefined): number {
    if (!cam) return 1;
    const flat = Math.hypot(cam.x - c.pos.x, cam.z - c.pos.z);
    const top = c.pos.y + 1.85 * this.scale;
    const dy = cam.y > top ? cam.y - top : cam.y < c.pos.y ? c.pos.y - cam.y : 0;
    const d = Math.hypot(Math.max(0, flat - 0.3 * this.scale), dy);
    const k = clamp((d - 0.1) / 0.4, 0, 1);
    return 0.12 + 0.88 * k * k * (3 - 2 * k);
  }

  update(c: CharSnap, dt: number, f: CharFrame): void {
    const s = this.scale;
    this.root.position.set(c.pos.x, c.pos.y, c.pos.z);
    this.yawG.rotation.y = c.yaw;
    this.syncPatterns();
    this.setDegrade(f.degrade);
    const fade = this.fadeFor(c, f.cam);
    if (Math.abs(fade - this.fade) > 0.01 || (fade >= 0.999) !== (this.fade >= 0.999)) {
      this.fade = fade;
      this.applyMaterials();
    }
    const cue = pushCues.get(c.id);
    if (cue !== undefined) {
      pushCues.delete(c.id);
      if (performance.now() - cue < 500 && c.state === 'normal') this.pushT = PUSH_TIME;
    }
    if (this.item) this.item.visible = f.itemOnBody && f.degrade === 'none';
    this.halo.visible = c.leader && f.degrade === 'none';
    if (this.specs) this.specs.visible = !c.specsOff;
    this.mouthMesh.scale.y = 1 + clamp(f.mouth, 0, 1) * 5;

    const ragdoll = c.state === 'ragdoll';
    const sleeping = c.state === 'sleeping';
    const speed = Math.hypot(c.vel.x, c.vel.z);
    // Local-frame travel direction (undo yaw).
    const cy = Math.cos(-c.yaw), sy = Math.sin(-c.yaw);
    const lx = c.vel.x * cy + c.vel.z * sy;
    const lz = -c.vel.x * sy + c.vel.z * cy;

    if (ragdoll && !this.wasRagdoll) {
      // Fall the way we were knocked; backwards if barely moving.
      let dx = lx, dz = lz;
      const l = Math.hypot(dx, dz);
      if (l < 0.5) { dx = 0; dz = 1; } else { dx /= l; dz /= l; }
      this.axis.set(dz, 0, -dx).normalize();
      this.thetaVel += 6 + speed;
      for (const j of Object.values(this.joints)) { j.vx += (this.rand() - 0.5) * 30; j.vz += (this.rand() - 0.5) * 30; }
    }
    if (sleeping && !this.wasSleeping) {
      this.axis.set(1, 0, 0);
      this.theta = 0;
    }
    this.wasRagdoll = ragdoll;
    this.wasSleeping = sleeping;

    // Body tumble.
    const half = Math.PI / 2;
    if (ragdoll) {
      if (speed > 3) this.thetaTarget = this.theta + speed * 0.35;
      else this.thetaTarget = half + Math.round((this.theta - half) / Math.PI) * Math.PI;
    } else if (sleeping) {
      this.thetaTarget = half;
    } else {
      this.thetaTarget = Math.round(this.theta / (Math.PI * 2)) * Math.PI * 2;
    }
    const kT = ragdoll ? 70 : 40, cT = ragdoll ? 9 : 12;
    // Springs are sub-stepped so they stay stable at low frame rates.
    const subs = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / subs;
    for (let i = 0; i < subs; i++) {
      this.thetaVel += (kT * (this.thetaTarget - this.theta) - cT * this.thetaVel) * h;
      this.theta += this.thetaVel * h;
    }
    if (!ragdoll && !sleeping && Math.abs(this.theta - this.thetaTarget) < 0.01 && Math.abs(this.thetaVel) < 0.05) {
      this.theta = this.thetaTarget = this.thetaVel = 0;
    }
    this.tumbleG.quaternion.setFromAxisAngle(this.axis, this.theta);
    const lying = Math.abs(Math.sin(this.theta));
    const crouch = !ragdoll && (c.sneaking || c.plant > 0) ? 0.12 : 0;
    this.tumbleG.position.y = this.hipH - crouch + (0.24 - this.hipH) * lying;

    // Gait and pose.
    const J = this.joints;
    const floppy = ragdoll || sleeping;
    if (!floppy) {
      const gait = clamp(speed / 3.6, 0, 1.4);
      this.walkPhase += dt * (4 + speed * 2.2) * (gait > 0.05 ? 1 : 0);
      const sw = Math.sin(this.walkPhase) * 0.75 * Math.min(1, gait);
      const air = Math.abs(c.vel.y) > 1.5 && !floppy;
      J.legL.tx = air ? 0.6 : sw;
      J.legR.tx = air ? -0.3 : -sw;
      J.legL.tz = J.legR.tz = 0;
      J.armL.tx = -sw * 0.8;
      J.armR.tx = sw * 0.8;
      J.armL.tz = -0.08;
      J.armR.tz = 0.08;
      if (f.holding) { J.armL.tx = J.armR.tx = 1.25; J.armL.tz = -0.25; J.armR.tz = 0.25; }
      if (c.charge > 0) { J.armR.tx = -2.3 - c.charge * 0.5; J.armR.tz = 0.2; }
      if (c.plant > 0) { J.armL.tx = J.armR.tx = 0.9 + Math.sin(this.walkPhase * 3) * 0.1; }
      if (this.look.role === 'grandma') {
        J.legL.tx *= 0.4; J.legR.tx *= 0.4;
        J.armR.tx = 0.25 + sw * 0.3;
        if (c.parchmentOpen) { J.armL.tx = 1.1; J.armR.tx = 1.0; J.armL.tz = -0.3; J.armR.tz = 0.3; }
      }
      if (this.swingT > 0) {
        this.swingT -= dt;
        J.armR.tx = this.swingT > 0.2 ? -1.4 : 1.7;
      }
      J.head.tx = clamp(-c.pitch * 0.5, -0.5, 0.5);
      J.head.tz = 0;
      this.leanG.rotation.x = -(c.running ? 0.18 : 0) - (c.sneaking ? 0.3 : 0);
      if (this.pushT > 0) {
        // The shove: a quick wind-back, then both arms thrust out, elbows wide (it reads
        // from behind, where the camera usually is), and the body lunges in.
        this.pushT -= dt;
        const windUp = this.pushT > PUSH_TIME - 0.1;
        J.armL.tx = J.armR.tx = windUp ? -0.6 : 1.45;
        J.armL.tz = windUp ? -0.2 : -0.6;
        J.armR.tz = windUp ? 0.2 : 0.6;
        this.leanG.rotation.x = windUp ? 0.14 : -0.45;
      }
    } else {
      this.pushT = 0;
      this.flopTimer -= dt;
      if (this.flopTimer <= 0) {
        this.flopTimer = 0.12 + this.rand() * 0.25;
        const amp = sleeping ? 0.25 : 1.6;
        for (const j of Object.values(J)) {
          j.tx = (this.rand() - 0.5) * amp * 2;
          j.tz = (this.rand() - 0.5) * amp;
        }
        if (sleeping) { J.armL.tz = -0.4; J.armR.tz = 0.4; }
      }
      this.leanG.rotation.x *= 1 - damp(6, dt);
    }
    const k = floppy ? 28 : 260;
    const cdamp = floppy ? 3.5 : 30;
    for (const j of Object.values(J)) {
      for (let i = 0; i < subs; i++) {
        j.vx += (k * (j.tx - j.rx) - cdamp * j.vx) * h;
        j.vz += (k * (j.tz - j.rz) - cdamp * j.vz) * h;
        j.rx += j.vx * h;
        j.rz += j.vz * h;
      }
      j.obj.rotation.set(j.rx, 0, j.rz);
    }
    this.shadow.visible = f.degrade !== 'shapes';
    this.shadow.position.set(0, 0.012, 0);
    this.shadow.scale.setScalar((0.95 + lying * 0.6) * s);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.fadeMats.values()) m.dispose();
    this.fadeMats.clear();
  }
}
