// Input (keyboard, touch joystick, drag-to-look, pinch/wheel zoom), the player's
// movement on the walkable map, and a third-person camera that avoids walls.
import * as THREE from 'three';
import type { AreaId } from '../state/progress.ts';
import { isSplashOpen } from '../ui/splashFocus.ts';
import { canStep, walkHeight, zoneAt, type Zone } from './layout.ts';
import type { Monk } from './monk.ts';

export class Input {
  move = new THREE.Vector2(); // x: right, y: forward, length ≤ 1
  lookDX = 0;
  lookDY = 0;
  zoom = 0;
  interactPressed = false;
  touchUsed = false;
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOrigin = new THREE.Vector2();
  private joyVec = new THREE.Vector2();
  private lookPointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private joyEl: HTMLElement;
  private knobEl: HTMLElement;

  constructor(private el: HTMLElement) {
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joy';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joy-knob';
    this.joyEl.appendChild(this.knobEl);
    document.body.appendChild(this.joyEl);

    addEventListener('keydown', (e) => {
      if (isSplashOpen()) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.interactPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.moveP(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY) * 0.8;
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private down(e: PointerEvent) {
    const touch = e.pointerType === 'touch';
    if (touch) this.touchUsed = true;
    if (touch && e.clientX < innerWidth * 0.45 && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin.set(e.clientX, e.clientY);
      this.joyVec.set(0, 0);
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
      this.joyEl.classList.add('on');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    } else {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.lookPointers.size === 2) this.pinchDist = this.pointerSpread();
    }
  }
  private pointerSpread(): number {
    const [a, b] = [...this.lookPointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  private moveP(e: PointerEvent) {
    if (e.pointerId === this.joyId) {
      const R = 55;
      this.joyVec.set(e.clientX - this.joyOrigin.x, e.clientY - this.joyOrigin.y);
      if (this.joyVec.length() > R) this.joyVec.setLength(R);
      this.knobEl.style.transform = `translate(calc(-50% + ${this.joyVec.x}px), calc(-50% + ${this.joyVec.y}px))`;
      return;
    }
    const p = this.lookPointers.get(e.pointerId);
    if (!p) return;
    if (this.lookPointers.size === 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const d = this.pointerSpread();
      this.zoom -= (d - this.pinchDist) * 0.03;
      this.pinchDist = d;
      return;
    }
    this.lookDX += e.clientX - p.x;
    this.lookDY += e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
  }
  private up(e: PointerEvent) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyVec.set(0, 0);
      this.joyEl.classList.remove('on');
    }
    this.lookPointers.delete(e.pointerId);
  }

  /** Sample once per frame. */
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.joyId !== null) {
      const R = 55;
      x = this.joyVec.x / R;
      y = -this.joyVec.y / R;
      if (Math.hypot(x, y) < 0.15) x = y = 0;
    }
    this.move.set(x, y);
    if (this.move.length() > 1) this.move.normalize();
  }
  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY, zoom: this.zoom };
    this.lookDX = this.lookDY = this.zoom = 0;
    return r;
  }
}

export class Player {
  pos = new THREE.Vector3();
  ry = Math.PI; // facing north
  speed = 0;
  zone: Zone | null = null;
  frozen = false; // during actions that root the monk in place
  blockedArea: AreaId | null = null; // a locked area the player just walked into
  private stepT = 0;
  onStep: () => void = () => {};

  constructor(public monk: Monk, private allowed: (a: AreaId) => boolean) {}

  place(x: number, z: number, ry?: number) {
    this.pos.set(x, walkHeight(x, z), z);
    if (ry !== undefined) this.ry = ry;
    this.zone = zoneAt(x, z);
    this.sync();
  }

  update(dt: number, move: THREE.Vector2, camYaw: number, slow: boolean) {
    this.blockedArea = null;
    const want = this.frozen ? 0 : move.length();
    const max = slow ? 2.1 : 3.0;
    this.speed += (want * max - this.speed) * Math.min(1, dt * 8);
    if (want > 0.01 && !this.frozen) {
      // camera-relative direction
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const dx = fx * move.y + rx * move.x, dz = fz * move.y + rz * move.x;
      const targetRy = Math.atan2(dx, dz);
      let diff = targetRy - this.ry;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.ry += diff * Math.min(1, dt * 12);
      const len = Math.hypot(dx, dz) || 1;
      const step = this.speed * dt;
      this.tryMove((dx / len) * step, (dz / len) * step);
      this.stepT += step;
      if (this.stepT > 1.1) {
        this.stepT = 0;
        this.onStep();
      }
    }
    this.sync();
  }

  private tryMove(dx: number, dz: number) {
    const attempts: [number, number][] = [[dx, dz], [dx, 0], [0, dz]];
    for (const [ax, az] of attempts) {
      if (ax === 0 && az === 0) continue;
      const nx = this.pos.x + ax, nz = this.pos.z + az;
      const r = canStep(nx, nz, this.pos.y, this.allowed);
      if (r.ok) {
        this.pos.set(nx, r.y, nz);
        this.zone = r.zone;
        return;
      }
      if (r.zone && !this.allowed(r.zone.area)) this.blockedArea = r.zone.area;
    }
  }

  private sync() {
    this.monk.root.position.copy(this.pos);
    this.monk.root.rotation.y = this.ry;
  }
}

export class CameraRig {
  yaw = 0;
  pitch = 0.38;
  dist = 10;
  private target = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private curDist = 10;

  constructor(public camera: THREE.PerspectiveCamera, private occluders: THREE.Object3D[], private groundAt: (x: number, z: number) => number) {}

  snap(p: THREE.Vector3) {
    this.target.copy(p).add(new THREE.Vector3(0, 1.1, 0));
    this.update(1, p, { dx: 0, dy: 0, zoom: 0 });
  }

  update(dt: number, focus: THREE.Vector3, look: { dx: number; dy: number; zoom: number }) {
    this.yaw -= look.dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, 0.08, 1.2);
    this.dist = THREE.MathUtils.clamp(this.dist + look.zoom, 4, 18);
    const goal = focus.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.target.lerp(goal, 1 - Math.exp(-dt * 10));

    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull in when a wall or roof is between the camera and the monk
    let want = this.dist;
    this.ray.set(this.target, dir);
    this.ray.far = this.dist;
    const hit = this.ray.intersectObjects(this.occluders, true)[0];
    if (hit) want = Math.max(1.6, hit.distance - 0.35);
    this.curDist += (want - this.curDist) * (want < this.curDist ? 1 : 1 - Math.exp(-dt * 3));
    const cam = this.target.clone().addScaledVector(dir, this.curDist);
    const floor = this.groundAt(cam.x, cam.z) + 0.4;
    if (cam.y < floor) cam.y = floor;
    this.camera.position.copy(cam);
    this.camera.lookAt(this.target);
  }
}
