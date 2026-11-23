// Gestures and dances on the primitive characters (render/characters.ts): each
// emote is a pose over time, joint targets the model's springs then chase, plus
// a lean, a bob and a spin of the whole body; and the props some need: a
// pixelated censor block over a hand or a bottom, a tongue, a hanky and tears,
// a tape measure stretched between the hands, a wad of notes, a floating heart.
//
// Model frame: the character faces -Z. Arms and legs: rx > 0 swings forward and
// up (PI = straight up); rz < 0 takes the left limb out to the side, rz > 0 the
// right one. Head: rx > 0 looks up, rz > 0 tilts to the left. Lean: x < 0
// bends forward, z > 0 leans left.
import * as THREE from 'three';
import type { EmoteId } from '../../../shared/emotes.js';
import { mat } from './materials.js';

export interface JointTarget { tx: number; tz: number }
export type Joints = Record<'armL' | 'armR' | 'legL' | 'legR' | 'head', JointTarget>;

/** What a pose sets besides the joints. */
export interface BodyPose { leanX: number; leanZ: number; bob: number; spin: number }

const PI = Math.PI;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const w = (f: number, t: number, ph = 0): number => Math.sin(2 * PI * f * t + ph);
const pos = (x: number): number => Math.max(0, x);

/**
 * Set the joint targets and body pose for emote `id`, `t` seconds in. Leaves
 * anything it does not mention as the gait put it, except the arms, which
 * every emote takes over.
 */
export function emotePose(id: EmoteId, t: number, J: Joints, b: BodyPose): void {
  b.leanX = 0; b.leanZ = 0; b.bob = 0; b.spin = 0;
  J.legL.tx = J.legR.tx = J.legL.tz = J.legR.tz = 0;
  J.head.tx = 0; J.head.tz = 0;
  const arms = (lx: number, lz: number, rx: number, rz: number) => { J.armL.tx = lx; J.armL.tz = lz; J.armR.tx = rx; J.armR.tz = rz; };
  switch (id) {
    // ── Cousin gestures ──
    case 'heart-hands':
      // Hands together in a heart in front of the chest.
      arms(1.75, 0.62, 1.75, -0.62);
      J.head.tz = 0.18 * w(0.8, t);
      b.bob = 0.02 * w(1.6, t);
      break;
    case 'crocodile-tears':
      arms(2.55, 0.5, 0.9 + 0.1 * w(3, t), -0.35);
      J.head.tx = -0.35;
      b.leanX = -0.15;
      b.leanZ = 0.04 * w(5, t);
      b.bob = 0.025 * Math.abs(w(2.5, t));
      break;
    case 'raspberry':
      // Hands waggling by the ears, tongue out, shaking with it.
      arms(2.55, -0.28 + 0.12 * w(6, t), 2.55, 0.28 - 0.12 * w(6, t, 1));
      b.leanX = -0.22;
      J.head.tx = -0.05 + 0.05 * w(13, t);
      J.head.tz = 0.07 * w(9, t);
      break;
    case 'nose-thumb':
      // Thumb on the nose, the other hand out in front of it, fingers going.
      arms(1.75 + 0.06 * w(7, t), 0.42 + 0.1 * w(7, t), 2.65, -0.33);
      J.head.tz = 0.15 * w(1.5, t);
      b.leanX = 0.08;
      b.bob = 0.03 * Math.abs(w(2, t));
      break;
    case 'the-bird':
      arms(-0.25, -0.55, 2.05 + 0.1 * w(2, t), 0.15);
      b.leanX = 0.12;
      J.head.tx = 0.15;
      J.head.tz = -0.1;
      break;
    case 'moon':
      // Bent double, hands on knees, wiggling: the legs stay upright under the bend.
      b.leanX = -1.15;
      J.legL.tx = J.legR.tx = 1.15;
      J.legL.tz = -0.12; J.legR.tz = 0.12;
      arms(0.95, 0.15, 0.95, -0.15);
      J.head.tx = 0.9;
      b.leanZ = 0.18 * w(2.2, t);
      b.bob = -0.1;
      break;
    case 'coffin-measure':
      if (t < 1.3) {
        arms(1.2, -1.0, 1.2, 1.0); // across, out in front: the width
        b.leanX = -0.1;
      } else if (t < 2.3) {
        arms(0.75, 0.1, 2.6, -0.1); // up and down, out in front: the height
        J.head.tx = 0.25;
      } else {
        arms(0.1, -0.1, 1.55, 0.2); // a thumbs up: that'll do
        J.head.tx = -0.25 * Math.abs(w(2, t));
      }
      break;
    case 'money-count':
      arms(1.25, 0.25, 1.15 + 0.35 * pos(w(3, t)), -0.3);
      J.head.tx = -0.45;
      J.head.tz = 0.08 * w(1.5, t);
      b.leanX = -0.1;
      break;
    // ── Cousin dances ──
    case 'will-jig':
      // Stiff arms, flying feet.
      J.legL.tx = pos(w(1.5, t)) * 1.0 - 0.12;
      J.legR.tx = pos(-w(1.5, t)) * 1.0 - 0.12;
      arms(0, 0.02, 0, -0.02);
      b.bob = 0.09 * Math.abs(w(1.5, t));
      b.leanX = 0.05;
      break;
    case 'tea-twirl':
      b.spin = t * PI;
      arms(0.6, -1.0, 2.9, 0.2);
      J.legL.tx = 0.15 * w(1, t);
      b.bob = 0.03 + 0.05 * w(2, t);
      J.head.tz = 0.15;
      break;
    case 'gold-digger': {
      // Shovelling it in, hips going.
      const ph = t % 1;
      const dig = ph < 0.5;
      arms(dig ? 0.45 : 2.35, 0.25, dig ? 0.45 : 2.35, -0.25);
      b.leanX = dig ? -0.45 : 0.1;
      b.leanZ = 0.12 * w(4, t);
      b.bob = -0.06 + 0.04 * w(4, t);
      J.legL.tx = J.legR.tx = dig ? 0.4 : 0.1;
      b.spin = 0.3 * w(0.5, t);
      break;
    }
    case 'grave-stomp': {
      const ph = (t * 2) % 2;
      J.legL.tx = ph < 1 ? 1.1 * Math.sin(PI * ph) : 0;
      J.legR.tx = ph >= 1 ? 1.1 * Math.sin(PI * (ph - 1)) : 0;
      arms(2.2 + 0.6 * w(1, t), -0.3, 2.2 - 0.6 * w(1, t), 0.3);
      J.head.tx = -0.35;
      b.bob = -0.05 * (1 - Math.abs(Math.sin(PI * ph)));
      break;
    }
    case 'funeral-march':
      J.legL.tx = 0.35 * pos(w(0.5, t));
      J.legR.tx = 0.35 * pos(-w(0.5, t));
      arms(0.55, 0.35, 0.55, -0.35);
      J.head.tx = -0.45;
      b.leanZ = 0.05 * w(0.5, t);
      b.bob = 0.03 * Math.abs(w(0.5, t));
      break;
    case 'hip-replacement': {
      // Robotic, in jerks, one stiff leg out.
      const q = Math.floor(t * 4) % 4;
      b.leanZ = [0.2, 0, -0.2, 0][q];
      b.spin = [0, 0.3, 0, -0.3][q];
      J.legR.tz = 0.45;
      J.legR.tx = 0.2;
      arms(0.2, -0.6, q % 2 ? 1.2 : 0.1, 0.3);
      J.head.tz = -b.leanZ;
      break;
    }
    // ── Grandma gestures ──
    case 'cane-shake':
      arms(-0.2, -0.5, 2.7, 0.15 + 0.3 * w(7, t));
      b.leanX = -0.12;
      b.bob = 0.02 * w(7, t);
      break;
    case 'watching-you':
      // Two fingers to her eyes (the free hand), then the cane levelled at you.
      if (t < 1.0) arms(2.75, 0.3, 0.25, 0.08);
      else arms(-0.2, -0.5, 1.6 + 0.05 * w(3, t), 0);
      J.head.tx = -0.1;
      b.leanX = -0.12;
      break;
    case 'wag-finger':
      arms(2.1, 0.1 + 0.3 * w(4.5, t), 0.25, 0.08);
      J.head.tz = 0.12 * w(2.25, t);
      b.leanX = -0.08;
      break;
    case 'clutch-pearls':
      // The free hand at her pearls; the cane hand stays down (or the cane is in her face).
      arms(2.0, 0.78, 0.35, 0.1);
      b.leanX = 0.28;
      J.head.tx = 0.25;
      b.bob = 0.03;
      break;
    case 'blow-kiss':
      if (t < 0.7) arms(2.6, 0.35, 0.25, 0.08);
      else arms(1.8, -0.6, 0.25, 0.08);
      J.head.tz = 0.12;
      break;
    case 'fake-faint':
      if (t < 1.2) {
        arms(2.9, 0.25, 0.3, 0.1);
        b.leanX = 0.15 + 0.2 * (t / 1.2);
        J.head.tx = 0.3;
      } else if (t < 2.4) {
        arms(2.2, -0.2, 0.4, 0.6);
        b.leanX = 0.55;
        b.bob = -0.22;
        J.legL.tx = 0.5; J.legR.tx = -0.1;
        J.head.tx = 0.5;
      } else {
        arms(-0.2, -0.5, 2.8, 0.15); // only joking, cane aloft
        b.leanX = -0.05;
        b.bob = 0.02 * w(3, t);
      }
      break;
    // ── Grandma dances ──
    case 'charleston':
      J.legL.tx = 0.7 * w(1.1, t);
      J.legR.tx = -0.7 * w(1.1, t);
      J.legL.tz = -0.25 * pos(w(2.2, t));
      J.legR.tz = 0.25 * pos(w(2.2, t));
      arms(-1.0 * w(1.1, t), -0.4, 1.0 * w(1.1, t), 0.4);
      b.bob = 0.05 * Math.abs(w(2.2, t));
      b.leanX = -0.1;
      break;
    case 'the-twist':
      b.spin = 0.55 * w(1.6, t);
      b.leanZ = -0.1 * w(1.6, t);
      b.bob = -0.08;
      arms(0.9, -0.35 - 0.2 * w(1.6, t), 0.9, 0.35 - 0.2 * w(1.6, t));
      J.legL.tx = 0.25; J.legR.tx = -0.1;
      break;
    case 'still-alive':
      arms(2.4 + 0.5 * w(2, t), -0.3, 3.0, 0.2 + 0.15 * w(3, t));
      b.bob = 0.1 * Math.abs(w(1.5, t));
      J.legL.tx = 0.5 * pos(w(1.5, t));
      b.spin = t > 3 ? (t - 3) * 2 : 0;
      break;
  }
}

// ───────────────────────── props ─────────────────────────

/** The censor's mosaic: a few skin-ish blocks that shuffle while you look. */
let mosaicTex: THREE.CanvasTexture | null = null;
let mosaicAt = 0;
function mosaic(): THREE.CanvasTexture {
  if (mosaicTex) return mosaicTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const cols = ['#e8b89a', '#d79b7d', '#f2cdb5', '#c98b6b', '#b9785c', '#f6dccb', '#a86a50'];
  let x = 7;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    g.fillStyle = cols[x % cols.length];
    g.fillRect(i, j, 1, 1);
  }
  mosaicTex = new THREE.CanvasTexture(c);
  mosaicTex.magFilter = THREE.NearestFilter;
  mosaicTex.minFilter = THREE.NearestFilter;
  mosaicTex.wrapS = mosaicTex.wrapT = THREE.RepeatWrapping;
  mosaicTex.repeat.set(0.5, 0.5);
  mosaicTex.colorSpace = THREE.SRGBColorSpace;
  return mosaicTex;
}
/** Shuffle the mosaic a few times a second (shared by everyone; cheap). */
function shuffleMosaic(): void {
  const now = performance.now();
  if (!mosaicTex || now - mosaicAt < 110) return;
  mosaicAt = now;
  mosaicTex.offset.set(Math.floor(Math.random() * 8) / 16, Math.floor(Math.random() * 8) / 16);
}

let heartTex: THREE.CanvasTexture | null = null;
function heart(): THREE.CanvasTexture {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff4f7a';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 4, 10, 20, 10);
  g.bezierCurveTo(28, 10, 32, 18, 32, 22);
  g.bezierCurveTo(32, 18, 36, 10, 44, 10);
  g.bezierCurveTo(60, 10, 60, 36, 32, 56);
  g.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}

/** The parts of a character the props hang off. */
export interface RigParts { body: THREE.Object3D; head: THREE.Object3D; handL: THREE.Object3D; handR: THREE.Object3D; front: THREE.Object3D }

/**
 * A character's emote props, made the first time they are needed. `body` is
 * the leaning torso group (hands are measured in it), `front` turns with the
 * character but not with the lean (for floating hearts).
 */
export class EmoteRig {
  private made = false;
  private censorHand!: THREE.Mesh;
  private censorBum!: THREE.Mesh;
  private tongue!: THREE.Mesh;
  private hanky!: THREE.Mesh;
  private tears: THREE.Mesh[] = [];
  private tape!: THREE.Mesh;
  private wad!: THREE.Group;
  private hearts: THREE.Sprite[] = [];
  private all: THREE.Object3D[] = [];
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(private p: RigParts) {}

  private make(): void {
    this.made = true;
    const cm = new THREE.MeshBasicMaterial({ map: mosaic() });
    this.censorHand = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), cm);
    this.censorHand.position.set(0, 0.02, 0);
    this.p.handR.add(this.censorHand);
    this.censorBum = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.1), cm);
    this.censorBum.position.set(0, -0.04, 0.16);
    this.p.body.add(this.censorBum);
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.09), mat('#e0607a', { rough: 0.5 }));
    this.tongue.position.set(0, 0.085, -0.19);
    this.p.head.add(this.tongue);
    this.hanky = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.012), mat('#f4f1ea', { rough: 0.9 }));
    this.hanky.position.set(0, -0.02, -0.06);
    this.p.handL.add(this.hanky);
    const tearM = mat('#8fd3ff', { rough: 0.1, emissive: '#5ab8ff', emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) {
      const tr = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), tearM);
      tr.userData.side = s;
      this.p.head.add(tr);
      this.tears.push(tr);
    }
    this.tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.012), mat('#ffd23a', { rough: 0.5, emissive: '#6a5000', emissiveIntensity: 0.3 }));
    this.p.body.add(this.tape);
    this.wad = new THREE.Group();
    const note = mat('#6e9f6a', { rough: 0.8 });
    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.004, 0.07), note);
      n.position.y = i * 0.006;
      n.rotation.y = (i - 1) * 0.25;
      this.wad.add(n);
    }
    this.wad.position.set(0, -0.03, -0.04);
    this.p.handL.add(this.wad);
    const hm = new THREE.SpriteMaterial({ map: heart(), transparent: true, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(hm.clone());
      sp.scale.setScalar(0.22);
      this.p.front.add(sp);
      this.hearts.push(sp);
    }
    this.all = [this.censorHand, this.censorBum, this.tongue, this.hanky, ...this.tears, this.tape, this.wad, ...this.hearts];
    for (const o of this.all) o.visible = false;
  }

  /** Hide everything (no emote, or one without props). */
  hide(): void {
    if (!this.made) return;
    for (const o of this.all) o.visible = false;
  }

  /**
   * Show and animate the props of emote `id` at `t` s. `plain`: Grandma sees
   * this person as a blur, so only the censor blocks survive (they are funnier blurred).
   */
  show(id: EmoteId, t: number, plain: boolean): void {
    if (!this.made) this.make();
    for (const o of this.all) o.visible = false;
    const on = (o: THREE.Object3D, v = true) => { o.visible = v; };
    if (id === 'the-bird') { on(this.censorHand); shuffleMosaic(); }
    if (id === 'moon') { on(this.censorBum, t > 0.25); shuffleMosaic(); }
    if (plain) return;
    if (id === 'raspberry') {
      on(this.tongue);
      this.tongue.scale.z = 1 + 0.25 * Math.sin(t * 60);
    }
    if (id === 'crocodile-tears') {
      on(this.hanky);
      for (const tr of this.tears) {
        const k = ((t * 1.3 + (tr.userData.side > 0 ? 0.45 : 0)) % 1);
        tr.visible = true;
        tr.position.set(tr.userData.side * 0.07, 0.17 - k * 0.2, -0.165);
      }
    }
    if (id === 'money-count') on(this.wad);
    if (id === 'coffin-measure' && t < 2.3) {
      // Stretched between the hands, measured in the torso's frame.
      const a = this.p.body.worldToLocal(this.p.handL.getWorldPosition(this.v1));
      const b = this.p.body.worldToLocal(this.p.handR.getWorldPosition(this.v2));
      const len = a.distanceTo(b);
      if (len > 0.05) {
        on(this.tape);
        this.tape.position.copy(a).add(b).multiplyScalar(0.5);
        this.tape.scale.set(len, 1, 1);
        this.tape.quaternion.setFromUnitVectors(X_AXIS, b.sub(a).normalize());
      }
    }
    if (id === 'heart-hands' || (id === 'blow-kiss' && t > 0.7)) {
      const t0 = id === 'blow-kiss' ? 0.7 : 0.3;
      this.hearts.forEach((h, i) => {
        const k = (t - t0 - i * 0.45) / 1.3;
        if (k < 0 || k > 1) return;
        h.visible = true;
        const fwd = id === 'blow-kiss' ? 0.4 + k * 1.4 : 0.45;
        h.position.set(Math.sin(k * 6 + i) * 0.08, 1.35 + k * (id === 'blow-kiss' ? 0.2 : 0.7), -fwd);
        (h.material as THREE.SpriteMaterial).opacity = Math.min(1, (1 - k) * 2.5);
        h.scale.setScalar(0.16 + k * 0.12);
      });
    }
  }

  dispose(): void {
    for (const o of this.all) {
      o.removeFromParent();
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    }
  }
}
