// Props in the world: heirlooms (with shards once broken), signature items
// (hidden while worn on the owner's back), Mittens, the teacup and the pills.
// Carried props follow their carrier's hands.
import * as THREE from 'three';
import type { ItemKey } from '../../../shared/constants.js';
import type { CharSnap, PropSnap, Vec3, WishInfo } from '../../../shared/types.js';
import { hashStr, rng } from '../util.js';
import type { CharacterModel, Degrade } from './characters.js';
import { HEIRLOOM_COLORS, makeCat, makeHeirloom, makeItem, makePills, makeShards, makeTeacup, type CatParts } from './items.js';
import { blobMaterial, mat, puff } from './materials.js';

/** A shard flying out of a smash: bounces on the floor, then lies still. */
interface Flying { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; bounces: number }
/** One puff of the dust cloud a smash throws up. */
interface Puff { sprite: THREE.Sprite; vel: THREE.Vector3; age: number; life: number; size: number }

const SHARD_GRAVITY = 14;
const DUST_LIFE = 1.6;

export interface PropFrame {
  props: Map<string, PropSnap>;
  chars: Map<string, CharSnap>;
  models: Map<string, CharacterModel>;
  itemKeyOf: (owner: string) => ItemKey | null;
  /** Grandma's view: how degraded a prop at `p` looks. Cousins: always 'none'. */
  degradeAt: (p: Vec3) => Degrade;
  wishKind: WishInfo['kind'] | null;
  showWishMarker: boolean;
  isGrandma: boolean;
  /** Grandma: found item ids -> pinned. */
  found: Map<string, boolean>;
  time: number;
  dt: number;
}

const greyMat = new THREE.MeshStandardMaterial({ color: '#7a7672', roughness: 1 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#3b3835', roughness: 1 });

class PropView {
  readonly root = new THREE.Group();
  readonly body: THREE.Group;
  shards: THREE.Group | null = null;
  cat: CatParts | null = null;
  shadow: THREE.Mesh;
  marker: THREE.Mesh | null = null;
  ring: THREE.Mesh | null = null;
  pin: THREE.Mesh | null = null;
  degrade: Degrade = 'none';
  meshes: THREE.Mesh[] = [];
  lastPos = new THREE.Vector3();
  walk = 0;
  /** Seen in one piece: a later break is animated (shards fly, dust rises). */
  seenWhole = false;
  flying: Flying[] = [];
  dust: Puff[] = [];

  constructor(readonly snap: PropSnap, itemKey: ItemKey | null) {
    switch (snap.kind) {
      case 'heirloom': this.body = makeHeirloom(snap.variant ?? 'vase'); break;
      case 'item': this.body = itemKey ? makeItem(itemKey) : new THREE.Group(); break;
      case 'cat': this.cat = makeCat(); this.body = this.cat.group; break;
      case 'teacup': this.body = makeTeacup(); break;
      default: this.body = makePills(); break;
    }
    this.root.add(this.body);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMaterial());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.shadow.scale.setScalar(snap.kind === 'heirloom' ? 0.6 : snap.kind === 'cat' ? 0.55 : 0.35);
    this.root.add(this.shadow);
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.userData.mat = o.material; this.meshes.push(o); }
    });
  }

  setDegrade(d: Degrade): void {
    if (d === this.degrade) return;
    this.degrade = d;
    for (const m of this.meshes) m.material = d === 'none' ? (m.userData.mat as THREE.Material) : d === 'heavy' ? greyMat : darkMat;
  }
}

export class PropViews {
  private views = new Map<string, PropView>();
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  clear(): void {
    for (const v of this.views.values()) { v.root.removeFromParent(); this.endBurst(v); }
    this.views.clear();
  }

  /**
   * A smash seen as it happens: the shards start in the middle and fly out,
   * bounce and settle; a dust cloud puffs up and fades (review P9).
   */
  private burst(v: PropView, variant: string, seed: number): void {
    const shards = v.shards;
    if (!shards) return;
    const r = rng(seed ^ 0x5eed);
    for (const s of shards.children) {
      const out = new THREE.Vector3(s.position.x, 0, s.position.z);
      const dir = out.lengthSq() > 1e-6 ? out.normalize() : new THREE.Vector3(1, 0, 0);
      const speed = 1.6 + r() * 2.4;
      s.position.set(dir.x * 0.05, 0.3 + r() * 0.25, dir.z * 0.05);
      // Bigger pieces than the ones a late arrival finds, so the flight reads from across the room.
      s.scale.multiplyScalar(1.5);
      v.flying.push({
        mesh: s,
        vel: new THREE.Vector3(dir.x * speed, 2.6 + r() * 2.2, dir.z * speed),
        spin: new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18),
        bounces: 0,
      });
    }
    // A mid-grey cloud reads against white pedestals and dark floors alike.
    const tint = new THREE.Color(HEIRLOOM_COLORS[variant] ?? '#dddddd').lerp(new THREE.Color('#a99f8b'), 0.75);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.5;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff(), color: tint, transparent: true, depthWrite: false, opacity: 0.9 }));
      sprite.position.set(Math.cos(a) * 0.1, 0.25 + r() * 0.35, Math.sin(a) * 0.1);
      const size = 0.45 + r() * 0.4;
      sprite.scale.setScalar(size);
      v.root.add(sprite);
      v.dust.push({ sprite, vel: new THREE.Vector3(Math.cos(a) * (0.9 + r() * 1.0), 0.5 + r() * 0.8, Math.sin(a) * (0.9 + r() * 1.0)), age: 0, life: DUST_LIFE * (0.8 + r() * 0.5), size });
    }
  }

  /** Step a burst: shards bounce on the floor (local y = 0), dust drifts out and fades. */
  private stepBurst(v: PropView, dt: number): void {
    if (dt <= 0) return;
    v.flying = v.flying.filter((f) => {
      f.vel.y -= SHARD_GRAVITY * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y <= 0.02) {
        f.mesh.position.y = 0.02;
        f.bounces++;
        f.vel.y = -f.vel.y * 0.38;
        f.vel.x *= 0.55;
        f.vel.z *= 0.55;
        f.spin.multiplyScalar(0.5);
        if (f.bounces >= 3 || Math.abs(f.vel.y) < 0.4) return false;
      }
      return true;
    });
    v.dust = v.dust.filter((d) => {
      d.age += dt;
      const k = d.age / d.life;
      if (k >= 1) { d.sprite.removeFromParent(); d.sprite.material.dispose(); return false; }
      d.sprite.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(Math.exp(-2.2 * dt));
      d.sprite.scale.setScalar(d.size * (1 + k * 2));
      d.sprite.material.opacity = 0.9 * (1 - k * k);
      return true;
    });
  }

  private endBurst(v: PropView): void {
    for (const d of v.dust) { d.sprite.removeFromParent(); d.sprite.material.dispose(); }
    v.dust = [];
    v.flying = [];
  }

  update(f: PropFrame): void {
    for (const [id, v] of this.views) {
      if (!f.props.has(id)) { v.root.removeFromParent(); this.endBurst(v); this.views.delete(id); }
    }
    for (const p of f.props.values()) {
      let v = this.views.get(p.id);
      if (!v) {
        v = new PropView(p, p.kind === 'item' && p.owner ? f.itemKeyOf(p.owner) : null);
        this.views.set(p.id, v);
        this.scene.add(v.root);
      }
      this.updateOne(v, p, f);
    }
  }

  private updateOne(v: PropView, p: PropSnap, f: PropFrame): void {
    const holder = p.heldBy ? f.chars.get(p.heldBy) : undefined;
    const inHands = !!holder && holder.holding === p.id;
    // A signature item "on" its owner (not in hands) is drawn on their back by the character model.
    const worn = p.kind === 'item' && !!holder && !inHands;
    v.root.visible = !worn;
    if (worn) return;
    if (holder && inHands) {
      const model = f.models.get(holder.id);
      if (model) model.holdPoint(holder, this.tmp);
      else this.tmp.set(holder.pos.x, holder.pos.y + 1, holder.pos.z);
      v.root.position.copy(this.tmp).y -= p.kind === 'cat' ? 0.2 : 0.1;
      v.root.rotation.set(0, holder.yaw, 0);
    } else {
      v.root.position.set(p.pos.x, p.pos.y, p.pos.z);
      v.root.rotation.set(0, p.yaw, 0);
    }
    v.shadow.visible = !inHands && !p.broken;
    v.setDegrade(f.degradeAt(p.pos));

    if (p.kind === 'heirloom') {
      v.body.visible = !p.broken;
      if (!p.broken) v.seenWhole = true;
      if (p.broken && !v.shards) {
        v.shards = makeShards(p.variant ?? 'vase', hashStr(p.id));
        v.root.add(v.shards);
        // Only a break we watch happen flies apart; one we arrive to find just lies there.
        if (v.seenWhole) this.burst(v, p.variant ?? 'vase', hashStr(p.id));
      }
      if (v.flying.length || v.dust.length) this.stepBurst(v, f.dt);
      if (p.favourite && f.isGrandma && !v.ring && !p.broken) {
        v.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 28), mat('#ffd75a', { emissive: '#ffbf33', emissiveIntensity: 1.2 }));
        v.ring.rotation.x = Math.PI / 2;
        v.ring.position.y = 0.03;
        v.root.add(v.ring);
      }
      if (v.ring) v.ring.visible = !p.broken;
    }

    if (v.cat) {
      const moved = this.tmp.copy(v.root.position).sub(v.lastPos).length();
      v.lastPos.copy(v.root.position);
      const speed = f.dt > 0 ? moved / f.dt : 0;
      v.walk += f.dt * (speed > 0.2 ? 12 : 0);
      v.cat.tail.rotation.z = Math.sin(f.time * 2.2) * 0.5;
      v.cat.head.rotation.y = Math.sin(f.time * 0.7) * 0.3;
      v.cat.legs.forEach((l, i) => { l.rotation.x = speed > 0.2 ? Math.sin(v.walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
      if (inHands) v.cat.legs.forEach((l) => { l.rotation.x = Math.sin(f.time * 14) * 0.7; });
    }

    // Wish marker over the thing Nana wants (cousins only).
    const wanted = f.showWishMarker && !inHands && (
      (f.wishKind === 'tea' && p.kind === 'teacup') || (f.wishKind === 'pills' && p.kind === 'pills') || (f.wishKind === 'fetch-cat' && p.kind === 'cat'));
    if (wanted && !v.marker) {
      v.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), mat('#ffd75a', { emissive: '#ffb000', emissiveIntensity: 1.6 }));
      v.root.add(v.marker);
    }
    if (v.marker) {
      v.marker.visible = wanted;
      v.marker.position.y = 0.75 + Math.sin(f.time * 3) * 0.08;
      v.marker.rotation.y = f.time * 2;
    }

    // Grandma's found evidence: a red ring, plus a pin when she has pinned it.
    if (f.isGrandma && p.kind === 'item') {
      const found = f.found.has(p.id) && !p.heldBy;
      if (found && !v.ring) {
        v.ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 28), mat('#ff3b30', { emissive: '#ff2a1a', emissiveIntensity: 1.2 }));
        v.ring.rotation.x = Math.PI / 2;
        v.ring.position.y = 0.03;
        v.root.add(v.ring);
      }
      if (v.ring) v.ring.visible = found;
      const pinned = found && f.found.get(p.id) === true;
      if (pinned && !v.pin) {
        v.pin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 10), mat('#ff3b30', { emissive: '#ff2a1a', emissiveIntensity: 1 }));
        v.pin.rotation.x = Math.PI;
        v.root.add(v.pin);
      }
      if (v.pin) { v.pin.visible = pinned; v.pin.position.y = 0.6 + Math.sin(f.time * 2.5) * 0.05; }
    }
  }
}
