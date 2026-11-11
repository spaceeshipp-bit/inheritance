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

/**
 * Camera shake requested by the HUD (a crash right next to you). The HUD only
 * cues it when the player has not asked for reduced motion. Decays in ~0.4 s.
 */
let shakeAmp = 0;
export function cueShake(strength: number): void {
  if (!(strength > 0)) return;
  shakeAmp = Math.min(0.3, Math.max(shakeAmp, strength));
}

/** The rig that draws this page's view (one GameRenderer per page). */
let activeRig: CameraRig | null = null;

/**
 * Can the player's camera see world point `p`, or is a wall or floor of the
 * manor in the way? Used by the HUD to hide name tags behind walls. Before the
 * first third-person frame (no blockers known yet) everything counts as visible.
 */
export function lineOfSight(p: Vec3): boolean {
  return activeRig ? activeRig.sees(p) : true;
}

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
  private losRay = new THREE.Raycaster();
  private losDir = new THREE.Vector3();
  private blockers: THREE.Object3D[] = [];

  constructor() {
    activeRig = this;
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

  /** Hide Grandma's cane view-model (cinematic shots, replays: the rig camera is not the one looking). */
  hideViewModel(): void {
    this.viewModel.visible = false;
  }

  /** Current orbit boom length (m). */
  get boom(): number { return this.dist; }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  swing(): void { this.swingT = 0.35; }

  /** True when nothing of the map stands between the camera and `p`. */
  sees(p: Vec3): boolean {
    if (!this.blockers.length) return true;
    const from = this.camera.position;
    this.losDir.set(p.x - from.x, p.y - from.y, p.z - from.z);
    const len = this.losDir.length();
    if (len < 0.6) return true;
    this.losRay.set(from, this.losDir.divideScalar(len));
    this.losRay.far = len - 0.25;
    return this.losRay.intersectObjects(this.blockers, false).length === 0;
  }

  /** Jitter the camera while a cued shake lasts (applied after the view is placed). */
  private applyShake(dt: number): void {
    if (shakeAmp <= 0.002) { shakeAmp = 0; return; }
    const t = performance.now() / 1000;
    const a = shakeAmp;
    this.camera.position.x += (Math.sin(t * 61) + Math.sin(t * 37.3)) * 0.3 * a;
    this.camera.position.y += Math.sin(t * 53 + 1.3) * 0.35 * a;
    this.camera.position.z += Math.sin(t * 43 + 2.1) * 0.3 * a;
    this.camera.rotation.z += Math.sin(t * 47) * 0.12 * a;
    shakeAmp *= Math.exp(-7 * dt);
  }

  /** Third-person orbit around a cousin. */
  updateCousin(pos: Vec3, yaw: number, pitch: number, dt: number, blockers: THREE.Object3D[]): void {
    this.blockers = blockers;
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
    this.applyShake(dt);
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
    this.applyShake(dt);
  }

  private setFov(fov: number, dt: number): void {
    const next = this.camera.fov + (fov - this.camera.fov) * damp(10, dt);
    if (Math.abs(next - this.camera.fov) > 0.01) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }
}
