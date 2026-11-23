// Grandpa's ashes on the floor: grey footprints (shoe soles, left and right),
// one instanced mesh for all of them. The server sends them a few at a time
// (cousins: every one; Grandma: the ones she has seen), never whose they are.
import * as THREE from 'three';
import type { AshPrint } from '../../../shared/protocol.js';

/** Most prints drawn at once (the server keeps fewer a visit; a little spare). */
export const MAX_PRINTS = 320;
/** Sideways offset of each foot from the line walked (m). */
const FOOT_GAP = 0.11;

/** A shoe sole, toe towards -Z (the yaw convention: 0 looks down -Z). */
function soleGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Drawn in XY with the heel at -Y and the toe at +Y: a rounded sole with a waist.
  s.moveTo(0, -0.13);
  s.bezierCurveTo(0.055, -0.13, 0.05, -0.05, 0.04, 0.0);
  s.bezierCurveTo(0.06, 0.06, 0.06, 0.14, 0.0, 0.15);
  s.bezierCurveTo(-0.06, 0.14, -0.065, 0.06, -0.045, 0.0);
  s.bezierCurveTo(-0.05, -0.05, -0.055, -0.13, 0, -0.13);
  const g = new THREE.ShapeGeometry(s, 6);
  g.scale(1.2, 1.2, 1);
  // Lay it on the floor facing up: +Y goes to -Z, so the toe points down -Z.
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Where one print sits: on the floor beside the line walked, turned the way the foot pointed. */
export function printMatrix(p: AshPrint, out = new THREE.Matrix4()): THREE.Matrix4 {
  const side = p.side ? 1 : -1;
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw); // the walker's right
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
  return out.compose(new THREE.Vector3(p.x + rx * FOOT_GAP * side, p.y + 0.013, p.z + rz * FOOT_GAP * side), q, new THREE.Vector3(1, 1, 1));
}

export class AshPrints {
  readonly mesh: THREE.InstancedMesh;
  private shown = -1;

  constructor(scene: THREE.Scene) {
    const m = new THREE.MeshStandardMaterial({
      color: '#8f8b85', roughness: 1, transparent: true, opacity: 0.92, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(soleGeometry(), m, MAX_PRINTS);
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'ash-prints';
    scene.add(this.mesh);
  }

  /** Show `prints` (the newest MAX_PRINTS); `version` changes whenever the list does. */
  update(prints: readonly AshPrint[], version: number): void {
    if (version === this.shown) return;
    this.shown = version;
    const from = Math.max(0, prints.length - MAX_PRINTS);
    const tmp = new THREE.Matrix4();
    let n = 0;
    for (let i = from; i < prints.length; i++) this.mesh.setMatrixAt(n++, printMatrix(prints[i], tmp));
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
