// Procedural meshes for props: the cousins' signature items, heirloom variants,
// shards, Mittens the cat, the teacup and the pills. Origins sit at the base.
import * as THREE from 'three';
import type { ItemKey } from '../../../shared/constants.js';
import { rng } from '../util.js';
import { mat } from './materials.js';

const M = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  return mesh;
};

function lathe(points: [number, number][], m: THREE.Material, seg = 20): THREE.Mesh {
  return new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}

/** A signature item (about 0.25-0.45 m so it reads up close). */
export function makeItem(key: ItemKey): THREE.Group {
  const g = new THREE.Group();
  g.name = `item-${key}`;
  switch (key) {
    case 'trophy': {
      const gold = mat('#f2c230', { rough: 0.25, metal: 0.9 });
      g.add(M(new THREE.BoxGeometry(0.16, 0.06, 0.16), mat('#3a2a1a'), 0, 0.03, 0));
      g.add(M(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 10), gold, 0, 0.12, 0));
      g.add(lathe([[0.02, 0], [0.09, 0.02], [0.12, 0.12], [0.13, 0.2], [0.115, 0.2], [0.1, 0.12], [0.0, 0.05]], gold).translateY(0.18));
      for (const s of [-1, 1]) {
        const h = M(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), gold, s * 0.13, 0.31, 0);
        h.rotation.z = s * -Math.PI / 2;
        g.add(h);
      }
      break;
    }
    case 'phone': {
      g.add(M(new THREE.BoxGeometry(0.12, 0.22, 0.025), mat('#1b1b1f', { rough: 0.3 }), 0, 0.11, 0));
      g.add(M(new THREE.BoxGeometry(0.1, 0.18, 0.005), mat('#4aa3ff', { emissive: '#2a7fd0', emissiveIntensity: 0.9 }), 0, 0.115, -0.014));
      g.add(M(new THREE.BoxGeometry(0.13, 0.23, 0.02), mat('#d23c3c'), 0, 0.11, 0.008));
      break;
    }
    case 'sneakers': {
      const shoe = (x: number) => {
        const s = new THREE.Group();
        s.add(M(new THREE.BoxGeometry(0.11, 0.05, 0.28), mat('#f4f4f4'), 0, 0.025, 0));
        s.add(M(new THREE.BoxGeometry(0.1, 0.09, 0.2), mat('#2f80ed'), 0, 0.09, 0.03));
        s.add(M(new THREE.BoxGeometry(0.1, 0.06, 0.1), mat('#2f80ed'), 0, 0.07, -0.08));
        s.position.x = x;
        return s;
      };
      g.add(shoe(-0.065), shoe(0.065));
      break;
    }
    case 'briefcase': {
      const leather = mat('#5a3a1e', { rough: 0.5 });
      g.add(M(new THREE.BoxGeometry(0.4, 0.28, 0.1), leather, 0, 0.14, 0));
      g.add(M(new THREE.BoxGeometry(0.42, 0.02, 0.11), mat('#27ae60'), 0, 0.2, 0));
      const h = M(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), leather, 0, 0.28, 0);
      g.add(h);
      for (const s of [-1, 1]) g.add(M(new THREE.BoxGeometry(0.04, 0.03, 0.105), mat('#d8c070', { metal: 0.8, rough: 0.3 }), s * 0.12, 0.25, 0));
      break;
    }
    case 'jacket': {
      const lth = mat('#1f1a1f', { rough: 0.45 });
      g.add(M(new THREE.BoxGeometry(0.36, 0.34, 0.08), lth, 0, 0.17, 0));
      for (const s of [-1, 1]) {
        const sl = M(new THREE.BoxGeometry(0.09, 0.3, 0.08), lth, s * 0.22, 0.18, 0);
        sl.rotation.z = s * 0.25;
        g.add(sl);
      }
      g.add(M(new THREE.BoxGeometry(0.05, 0.3, 0.085), mat('#8e44ad'), 0, 0.17, 0));
      g.add(M(new THREE.BoxGeometry(0.38, 0.05, 0.09), mat('#c0c0c0', { metal: 0.9, rough: 0.3 }), 0, 0.33, 0));
      break;
    }
    case 'ring': {
      const gold = mat('#f5c542', { rough: 0.2, metal: 1 });
      const r = M(new THREE.TorusGeometry(0.09, 0.022, 10, 24), gold, 0, 0.12, 0);
      g.add(r);
      g.add(M(new THREE.OctahedronGeometry(0.04), mat('#e8f6ff', { rough: 0.05, metal: 0.2, emissive: '#9fd8ff', emissiveIntensity: 0.6 }), 0, 0.23, 0));
      break;
    }
    case 'trowel': {
      const blade = M(new THREE.ConeGeometry(0.08, 0.2, 4), mat('#a8b0b8', { metal: 0.8, rough: 0.35 }), 0, 0.1, 0);
      blade.scale.z = 0.2;
      blade.rotation.x = Math.PI;
      blade.position.y = 0.1;
      g.add(blade);
      g.add(M(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), mat('#888'), 0, 0.23, 0));
      g.add(M(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), mat('#16a085'), 0, 0.33, 0));
      break;
    }
    case 'scarf': {
      const knit = mat('#e84393', { rough: 1 });
      const t = M(new THREE.TorusGeometry(0.12, 0.04, 8, 18), knit, 0, 0.05, 0);
      t.rotation.x = Math.PI / 2;
      g.add(t);
      for (const s of [-1, 1]) {
        const tail = M(new THREE.BoxGeometry(0.08, 0.025, 0.22), knit, s * 0.06, 0.03, 0.2);
        tail.rotation.y = s * 0.2;
        g.add(tail);
        g.add(M(new THREE.BoxGeometry(0.085, 0.03, 0.04), mat('#ffffff'), s * 0.06 + s * 0.02, 0.03, 0.26));
      }
      break;
    }
  }
  return g;
}

export const HEIRLOOM_COLORS: Record<string, string> = {
  vase: '#3d6fb8', bust: '#ece6da', clock: '#7a4a24', urn: '#9a6a32', portrait: '#c9a24a', teapot: '#c8ccd2',
};

/** An heirloom (0.3-0.65 m) sitting on a pedestal top. */
export function makeHeirloom(variant: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `heirloom-${variant}`;
  switch (variant) {
    case 'vase': {
      const porcelain = mat('#f2f4f8', { rough: 0.2 });
      g.add(lathe([[0.0, 0], [0.12, 0], [0.18, 0.12], [0.2, 0.25], [0.12, 0.42], [0.08, 0.5], [0.11, 0.58], [0.0, 0.58]], porcelain));
      const band = lathe([[0.18, 0.13], [0.205, 0.2], [0.2, 0.3], [0.17, 0.33]], mat('#2f5fb0', { rough: 0.25 }));
      g.add(band);
      g.add(lathe([[0.09, 0.48], [0.115, 0.56], [0.1, 0.58]], mat('#2f5fb0', { rough: 0.25 })));
      break;
    }
    case 'bust': {
      const stone = mat('#ece6da', { rough: 0.45 });
      g.add(M(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12), stone, 0, 0.06, 0));
      g.add(M(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 0.12, 0));
      g.add(M(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), stone, 0, 0.27, 0));
      g.add(M(new THREE.SphereGeometry(0.11, 14, 12), stone, 0, 0.4, 0));
      g.add(M(new THREE.BoxGeometry(0.03, 0.05, 0.04), stone, 0, 0.39, -0.11));
      break;
    }
    case 'clock': {
      const w = mat('#7a4a24', { rough: 0.4 });
      g.add(M(new THREE.BoxGeometry(0.34, 0.06, 0.18), w, 0, 0.03, 0));
      g.add(M(new THREE.BoxGeometry(0.28, 0.34, 0.15), w, 0, 0.23, 0));
      const top = M(new THREE.CylinderGeometry(0.14, 0.14, 0.15, 16, 1, false, 0, Math.PI), w, 0, 0.4, 0);
      top.rotation.x = Math.PI / 2;
      top.rotation.z = Math.PI / 2;
      g.add(top);
      const face = M(new THREE.CircleGeometry(0.1, 20), mat('#f6efdc', { rough: 0.5 }), 0, 0.27, -0.078);
      face.rotation.y = Math.PI;
      g.add(face);
      g.add(M(new THREE.BoxGeometry(0.012, 0.08, 0.004), mat('#111'), 0, 0.3, -0.081));
      g.add(M(new THREE.BoxGeometry(0.06, 0.012, 0.004), mat('#111'), 0.025, 0.27, -0.081));
      break;
    }
    case 'urn': {
      const bronze = mat('#9a6a32', { rough: 0.35, metal: 0.7 });
      g.add(lathe([[0, 0], [0.1, 0], [0.1, 0.05], [0.05, 0.1], [0.17, 0.25], [0.15, 0.38], [0.09, 0.42], [0.11, 0.45], [0.0, 0.47]], bronze));
      for (const s of [-1, 1]) g.add(M(new THREE.TorusGeometry(0.05, 0.012, 6, 12), bronze, s * 0.17, 0.34, 0).rotateY(Math.PI / 2));
      g.add(M(new THREE.SphereGeometry(0.035, 8, 6), bronze, 0, 0.5, 0));
      break;
    }
    case 'portrait': {
      const gilt = mat('#c9a24a', { rough: 0.3, metal: 0.8 });
      const easel = mat('#4a2c1a');
      for (const s of [-1, 1]) {
        const leg = M(new THREE.BoxGeometry(0.03, 0.62, 0.03), easel, s * 0.14, 0.3, 0.05);
        leg.rotation.z = s * 0.12;
        g.add(leg);
      }
      const frame = new THREE.Group();
      frame.add(M(new THREE.BoxGeometry(0.42, 0.5, 0.04), gilt, 0, 0, 0));
      frame.add(M(new THREE.BoxGeometry(0.34, 0.42, 0.045), mat('#5a3a5a'), 0, 0, -0.002));
      frame.add(M(new THREE.SphereGeometry(0.08, 10, 8), mat('#e8c8a8'), 0, 0.05, -0.03));
      frame.add(M(new THREE.BoxGeometry(0.2, 0.14, 0.02), mat('#2a2a3a'), 0, -0.12, -0.03));
      frame.position.set(0, 0.42, 0);
      frame.rotation.x = -0.12;
      g.add(frame);
      break;
    }
    default: { // teapot
      const silver = mat('#c8ccd2', { rough: 0.2, metal: 0.9 });
      const pot = M(new THREE.SphereGeometry(0.15, 16, 12), silver, 0, 0.14, 0);
      pot.scale.set(1, 0.85, 1);
      g.add(pot);
      g.add(M(new THREE.CylinderGeometry(0.06, 0.1, 0.04, 14), silver, 0, 0.27, 0));
      g.add(M(new THREE.SphereGeometry(0.025, 8, 6), silver, 0, 0.31, 0));
      const spout = M(new THREE.CylinderGeometry(0.015, 0.035, 0.18, 8), silver, 0, 0.17, -0.19);
      spout.rotation.x = -0.9;
      g.add(spout);
      g.add(M(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI * 1.2), silver, 0, 0.15, 0.15).rotateY(Math.PI / 2));
      break;
    }
  }
  return g;
}

/** Shards of a broken heirloom scattered around its base. */
export function makeShards(variant: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const m = mat(HEIRLOOM_COLORS[variant] ?? '#ddd', { rough: 0.4 });
  const m2 = mat('#f2f0ea', { rough: 0.3 });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.035 + r() * 0.05), i % 3 === 0 ? m2 : m);
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.45;
    s.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
    s.rotation.set(r() * 6, r() * 6, r() * 6);
    s.scale.y = 0.5;
    g.add(s);
  }
  return g;
}

export interface CatParts { group: THREE.Group; tail: THREE.Object3D; head: THREE.Object3D; legs: THREE.Object3D[] }

/** Mittens: an orange tabby built from primitives, facing -Z. */
export function makeCat(): CatParts {
  const group = new THREE.Group();
  const fur = mat('#e08a3a', { rough: 1 });
  const white = mat('#f6efe4', { rough: 1 });
  const body = M(new THREE.CapsuleGeometry(0.11, 0.26, 6, 10), fur, 0, 0.2, 0);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  group.add(M(new THREE.SphereGeometry(0.09, 10, 8), white, 0, 0.17, -0.12));
  const head = new THREE.Group();
  head.position.set(0, 0.3, -0.24);
  head.add(M(new THREE.SphereGeometry(0.1, 12, 10), fur));
  head.add(M(new THREE.SphereGeometry(0.045, 8, 6), white, 0, -0.03, -0.075));
  for (const s of [-1, 1]) {
    head.add(M(new THREE.ConeGeometry(0.035, 0.07, 4), fur, s * 0.055, 0.09, 0));
    head.add(M(new THREE.SphereGeometry(0.014, 6, 4), mat('#2a5a1a', { emissive: '#3a7a1a', emissiveIntensity: 0.4 }), s * 0.04, 0.02, -0.085));
  }
  group.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.06, -0.14], [0.06, -0.14], [-0.06, 0.14], [0.06, 0.14]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.14, z);
    leg.add(M(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), x < 0 && z < 0 ? white : fur, 0, -0.07, 0));
    group.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, 0.22);
  const tm = M(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), fur, 0, 0.13, 0.04);
  tm.rotation.x = 0.4;
  tail.add(tm);
  group.add(tail);
  return { group, tail, head, legs };
}

export function makeTeacup(): THREE.Group {
  const g = new THREE.Group();
  const china = mat('#fbf8f2', { rough: 0.25 });
  g.add(M(new THREE.CylinderGeometry(0.1, 0.09, 0.015, 18), china, 0, 0.008, 0));
  g.add(lathe([[0.03, 0.015], [0.05, 0.02], [0.065, 0.06], [0.07, 0.09], [0.064, 0.09], [0.058, 0.06], [0.0, 0.03]], china));
  const tea = M(new THREE.CircleGeometry(0.062, 16), mat('#7a4a22', { rough: 0.2 }), 0, 0.08, 0);
  tea.rotation.x = -Math.PI / 2;
  g.add(tea);
  g.add(M(new THREE.TorusGeometry(0.068, 0.004, 4, 20), mat('#d4af37', { metal: 0.8, rough: 0.3 }), 0, 0.09, 0).rotateX(Math.PI / 2));
  g.add(M(new THREE.TorusGeometry(0.022, 0.007, 6, 10), china, 0.075, 0.06, 0));
  g.scale.setScalar(1.4);
  return g;
}

export function makePills(): THREE.Group {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12), mat('#c8781e', { rough: 0.2 }), 0, 0.06, 0));
  g.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12), mat('#ffffff', { rough: 0.5 }), 0, 0.137, 0));
  g.add(M(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 12, 1, true), mat('#f4f0e0'), 0, 0.06, 0));
  g.scale.setScalar(1.6);
  return g;
}
