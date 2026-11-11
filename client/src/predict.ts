// Own-player prediction with the same kinematic code as the server
// (shared/movement.ts): every input we send is also applied locally for one
// tick; when a snapshot arrives we restart from the server's state and replay
// the inputs it has not acknowledged yet. Corrections are blended out over a
// few frames instead of popping.
import { TICK_HZ } from '../../shared/constants.js';
import { groundHeight } from '../../shared/map.js';
import { createBody, stepMovement, type MoveBody, type MoveCmd } from '../../shared/movement.js';
import type { InputMsg } from '../../shared/protocol.js';
import type { CharSnap, Role, Vec3 } from '../../shared/types.js';
import { damp, localSec } from './util.js';

const STEP = 1 / TICK_HZ;
const MAX_PENDING = TICK_HZ * 2;

export class Predictor {
  private body: MoveBody | null = null;
  private pending: { seq: number; cmd: MoveCmd }[] = [];
  private prev: Vec3 = { x: 0, y: 0, z: 0 };
  private stepAt = 0;
  private offset: Vec3 = { x: 0, y: 0, z: 0 };
  private role: Role = 'cousin';
  private parchment = false;
  /** False while ragdolled/asleep or before the server sends `ack`: callers fall back to extrapolation. */
  active = false;
  /** How far the latest snapshot moved our predicted position (m); 0 when the prediction was exact. */
  lastError = 0;

  reset(): void {
    this.body = null;
    this.pending = [];
    this.active = false;
    this.offset = { x: 0, y: 0, z: 0 };
  }

  /** Apply one sent input locally. */
  input(msg: InputMsg, role: Role, parchmentOpen: boolean): void {
    this.role = role;
    this.parchment = parchmentOpen;
    const cmd: MoveCmd = { move: { ...msg.move }, yaw: msg.yaw, run: msg.run, sneak: msg.sneak, jump: msg.jump };
    this.pending.push({ seq: msg.seq, cmd });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (!this.body || !this.active) return;
    this.prev = { ...this.body.pos };
    stepMovement(this.body, cmd, STEP, { role, ragdoll: false, parchmentOpen });
    this.stepAt = localSec();
  }

  /** A snapshot of our character arrived: rebase and replay. */
  reconcile(me: CharSnap): void {
    const usable = me.state === 'normal' && typeof me.ack === 'number';
    if (!usable) { this.active = false; this.body = null; return; }
    const shownBefore = this.body && this.active ? this.display(false) : null;
    const predicted = this.body && this.active ? { ...this.body.pos } : null;
    const ack = me.ack as number;
    this.pending = this.pending.filter((p) => p.seq > ack);
    const g = groundHeight(me.pos.x, me.pos.z, me.pos.y);
    const b = createBody(me.pos);
    b.vel = { ...me.vel };
    b.onGround = Math.abs(me.pos.y - g) < 0.03 && me.vel.y <= 0.01;
    for (const p of this.pending) {
      this.prev = { ...b.pos };
      stepMovement(b, p.cmd, STEP, { role: this.role, ragdoll: false, parchmentOpen: this.parchment });
    }
    if (!this.pending.length) this.prev = { ...b.pos };
    this.lastError = predicted ? Math.hypot(predicted.x - b.pos.x, predicted.y - b.pos.y, predicted.z - b.pos.z) : 0;
    this.body = b;
    this.active = true;
    if (shownBefore) {
      const now = this.display(false);
      const ex = shownBefore.x - now.x, ey = shownBefore.y - now.y, ez = shownBefore.z - now.z;
      // Small corrections blend away; big ones (teleports) snap.
      if (Math.hypot(ex, ey, ez) < 2) this.offset = { x: this.offset.x + ex, y: this.offset.y + ey, z: this.offset.z + ez };
      else this.offset = { x: 0, y: 0, z: 0 };
    }
  }

  private display(withOffset: boolean): Vec3 {
    const b = this.body as MoveBody;
    const a = Math.min(1, (localSec() - this.stepAt) / STEP);
    const p = {
      x: this.prev.x + (b.pos.x - this.prev.x) * a,
      y: this.prev.y + (b.pos.y - this.prev.y) * a,
      z: this.prev.z + (b.pos.z - this.prev.z) * a,
    };
    if (withOffset) { p.x += this.offset.x; p.y += this.offset.y; p.z += this.offset.z; }
    return p;
  }

  /** Where to draw our character this frame, and its predicted velocity. */
  sample(dt: number): { pos: Vec3; vel: Vec3 } | null {
    if (!this.active || !this.body) return null;
    const k = 1 - damp(12, dt);
    this.offset = { x: this.offset.x * k, y: this.offset.y * k, z: this.offset.z * k };
    return { pos: this.display(true), vel: { ...this.body.vel } };
  }
}
