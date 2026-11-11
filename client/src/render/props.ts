// Props in the world: heirlooms (with shards once broken), signature items
// (hidden while worn on the owner's back), Mittens, the teacup and the pills.
// Carried props follow their carrier's hands.
import * as THREE from 'three';
import type { ItemKey } from '../../../shared/constants.js';
import type { CharSnap, PropSnap, Vec3, WishInfo } from '../../../shared/types.js';
import { hashStr } from '../util.js';
import type { CharacterModel, Degrade } from './characters.js';
import { makeCat, makeHeirloom, makeItem, makePills, makeShards, makeTeacup, type CatParts } from './items.js';
import { blobMaterial, mat } from './materials.js';

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
    for (const v of this.views.values()) v.root.removeFromParent();
    this.views.clear();
  }

  update(f: PropFrame): void {
    for (const [id, v] of this.views) {
      if (!f.props.has(id)) { v.root.removeFromParent(); this.views.delete(id); }
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
      if (p.broken && !v.shards) {
        v.shards = makeShards(p.variant ?? 'vase', hashStr(p.id));
        v.root.add(v.shards);
      }
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
