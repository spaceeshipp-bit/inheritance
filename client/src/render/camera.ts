// Cameras: a third-person orbit for cousins (pulled in by walls), and first
// person for Grandma with a horizontal field of view equal to her view cone
// (so she cannot see behind her). Spectacles narrow it.
import * as THREE from 'three';
import { SENSES, SPECTACLES } from '../../../shared/constants.js';
import type { Vec3 } from '../../../shared/types.js';
import { clamp, damp } from '../util.js';
import { mat } from './materials.js';

const ORBIT_DIST = 4.2;
const SHOULDER = 0.45;

/** Vertical FOV (degrees) whose horizontal half-angle is `halfDeg` at this aspect. */
export function vfovForHalfAngle(halfDeg: number, aspect: number): number {
  const h = (halfDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h) / aspect) * 180) / Math.PI;
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 90);
  private ray = new THREE.Raycaster();
  private dist = ORBIT_DIST;
  private viewModel = new THREE.Group();
  private swingT = 0;
  private eyeY = 1.8;

  constructor() {
    this.camera.rotation.order = 'YXZ';
    // Grandma's cane, visible at the lower right of her view.
    const caneM = mat('#3b2414', { rough: 0.4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), caneM);
    shaft.position.set(0, -0.45, 0);
    const crook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI), caneM);
    crook.rotation.y = Math.PI / 2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat('#e8c2a0', { rough: 0.7 }));
    hand.position.set(0, -0.02, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 10), mat('#5b3a5e', { rough: 0.85 }));
    sleeve.position.set(0.02, 0.03, 0.1);
    sleeve.rotation.x = Math.PI / 2;
    this.viewModel.add(shaft, crook, hand, sleeve);
    this.viewModel.position.set(0.42, -0.36, -0.75);
    this.viewModel.rotation.set(0.25, 0, -0.15);
    this.viewModel.scale.setScalar(0.8);
    this.viewModel.visible = false;
    this.camera.add(this.viewModel);
  }

  /** Current orbit boom length (m). */
  get boom(): number { return this.dist; }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  swing(): void { this.swingT = 0.35; }

  /** Third-person orbit around a cousin. */
  updateCousin(pos: Vec3, yaw: number, pitch: number, dt: number, blockers: THREE.Object3D[]): void {
    this.viewModel.visible = false;
    const p = clamp(pitch, -1.05, 0.75);
    const pivot = new THREE.Vector3(pos.x, pos.y + 1.55, pos.z);
    const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const want = pivot.clone().addScaledVector(f, -ORBIT_DIST).addScaledVector(right, SHOULDER);
    const dir = want.clone().sub(pivot);
    const len = dir.length();
    dir.normalize();
    this.ray.set(pivot, dir);
    this.ray.far = len + 0.3;
    const hit = this.ray.intersectObjects(blockers, false)[0];
    const target = hit ? Math.max(0.4, hit.distance - 0.3) : len;
    // Pull in instantly, ease back out.
    this.dist = target < this.dist ? target : this.dist + (target - this.dist) * damp(5, dt);
    const cam = pivot.clone().addScaledVector(dir, this.dist);
    cam.y = Math.max(cam.y, pos.y + 0.3);
    this.camera.position.copy(cam);
    this.camera.rotation.set(p, yaw, 0, 'YXZ');
    this.setFov(70, dt);
  }

  /** First person for Grandma. */
  updateGrandma(pos: Vec3, yaw: number, pitch: number, dt: number, o: { specs: boolean; down: boolean; parchment: boolean }): void {
    const eye = o.down ? 0.5 : 1.8;
    this.eyeY += (eye - this.eyeY) * damp(8, dt);
    const fx = -Math.sin(yaw) * 0.12, fz = -Math.cos(yaw) * 0.12;
    this.camera.position.set(pos.x + fx, pos.y + this.eyeY, pos.z + fz);
    this.camera.rotation.set(clamp(pitch, -1.2, 1.2), yaw, o.down ? 0.6 : 0, 'YXZ');
    const half = o.specs ? SPECTACLES.coneHalfAngleDeg : SENSES.coneHalfAngleDeg;
    this.setFov(vfovForHalfAngle(half, this.camera.aspect), dt);
    this.viewModel.visible = !o.down && !o.parchment;
    if (this.swingT > 0) this.swingT -= dt;
    const s = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) : 0;
    this.viewModel.rotation.set(0.25 - s * 1.4, 0, -0.15 - s * 0.3);
    this.viewModel.position.set(0.42 - s * 0.18, -0.36 + s * 0.12, -0.75 - s * 0.15);
  }

  private setFov(fov: number, dt: number): void {
    const next = this.camera.fov + (fov - this.camera.fov) * damp(10, dt);
    if (Math.abs(next - this.camera.fov) > 0.01) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }
}
