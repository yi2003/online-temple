// Other monks: simulated residents who go about quiet practices, plus real players
// (from the presence service) who are drawn the same way and smoothly interpolated.
import * as THREE from 'three';
import { mulberry32, randomName, type DharmaName } from '../state/names.ts';
import { UNLOCKS } from '../state/progress.ts';
import { blocked, SPOTS, walkHeight, zoneAt } from './layout.ts';
import { ACT_DURATION, Monk, type Act } from './monk.ts';

type Task = 'stroll' | 'incense' | 'cushionBow' | 'sweep' | 'beads' | 'sit' | 'fish' | 'gate' | 'chant';
interface Pt { x: number; z: number }

const REGIONS = ['plaza', 'steps', 'court', 'hall'] as const;
type Region = (typeof REGIONS)[number];
// waypoint pairs crossing from region i to region i+1 (walking toward the hall)
const PORTALS: Pt[][] = [
  [{ x: 0, z: 35 }, { x: 0, z: 33 }],
  [{ x: 0, z: 21 }, { x: 0, z: 19 }],
  [{ x: 0, z: -5 }, { x: 0, z: -10.2 }],
];
function regionOf(x: number, z: number): Region {
  const zn = zoneAt(x, z)?.name;
  if (zn === 'plaza') return 'plaza';
  if (zn === 'steps') return 'steps';
  if (zn === 'hall' || zn === 'hallSteps') return 'hall';
  return 'court';
}
function routeTo(from: Pt, to: Pt): Pt[] {
  const a = REGIONS.indexOf(regionOf(from.x, from.z));
  const b = REGIONS.indexOf(regionOf(to.x, to.z));
  const path: Pt[] = [];
  if (a < b) for (let i = a; i < b; i++) path.push(...PORTALS[i]);
  else for (let i = a - 1; i >= b; i--) path.push(...[...PORTALS[i]].reverse());
  path.push(to);
  return path;
}

const rnd = mulberry32((Date.now() / 3.6e6) | 0);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
function courtPoint(): Pt {
  for (;;) {
    const p = { x: -19 + rnd() * 38, z: -21 + rnd() * 38 };
    if (!blocked(p.x, p.z) && regionOf(p.x, p.z) === 'court' && !(Math.abs(p.x) < 8.5 && p.z < -7)) return p;
  }
}

const cushionUsers = new Map<number, Resident>();
const usedNames = new Set<string>();
export const cushionTaken = (i: number) => cushionUsers.has(i);

export class Resident {
  monk: Monk;
  name: DharmaName;
  id: string;
  private path: Pt[] = [];
  private task: Task = 'stroll';
  private timer = 0; // time left in the current activity
  private faceRy: number | null = null;
  private cushion = -1;
  private repeat = 0;
  private tick = 0;
  private resume: Act | null = null;
  private walkT = 0;
  onFish: (m: Resident) => void = () => {};

  constructor(index: number) {
    this.id = 'sim' + index;
    do this.name = randomName(rnd);
    while (usedNames.has(this.name.zh));
    usedNames.add(this.name.zh);
    const rank = Math.floor(rnd() * rnd() * 6);
    this.monk = new Monk({ robe: UNLOCKS.robe[rank], beads: UNLOCKS.beads[Math.floor(rnd() * (rank + 1))], accessory: rnd() < 0.4 ? UNLOCKS.accessory[rank] : 'none' });
    const p = courtPoint();
    this.place(p.x, p.z);
    this.monk.root.rotation.y = rnd() * Math.PI * 2;
    this.timer = rnd() * 4;
  }

  get pos() {
    return this.monk.root.position;
  }
  private place(x: number, z: number) {
    this.monk.root.position.set(x, walkHeight(x, z), z);
  }

  private releaseCushion() {
    if (this.cushion >= 0 && cushionUsers.get(this.cushion) === this) cushionUsers.delete(this.cushion);
    this.cushion = -1;
  }
  /** Residents use only the front row (even indices), so the back row stays free for players. */
  private claimCushion(): number {
    const free = SPOTS.cushions.map((_, i) => i).filter((i) => i % 2 === 0 && !cushionUsers.has(i));
    if (!free.length) return -1;
    const i = pick(free);
    cushionUsers.set(i, this);
    this.cushion = i;
    return i;
  }

  private goTo(p: Pt) {
    this.path = routeTo({ x: this.pos.x, z: this.pos.z }, p);
    this.walkT = 0;
  }

  private choose(chanting: boolean) {
    this.releaseCushion();
    this.faceRy = null;
    this.monk.setAct('idle');
    if (chanting) {
      this.task = 'chant';
      const c = this.claimCushion();
      const spot = c >= 0 ? SPOTS.cushions[c] : { x: (rnd() - 0.5) * 9, z: -9.9 - rnd() * 0.6 };
      this.goTo(spot);
      return;
    }
    const r = rnd();
    this.task = r < 0.22 ? 'stroll' : r < 0.34 ? 'incense' : r < 0.5 ? 'cushionBow' : r < 0.62 ? 'sweep' : r < 0.74 ? 'beads' : r < 0.84 ? 'sit' : r < 0.94 ? 'fish' : 'gate';
    switch (this.task) {
      case 'incense': this.goTo({ x: SPOTS.burner.x + (rnd() - 0.5) * 1.5, z: SPOTS.burner.z + 2.1 }); break;
      case 'cushionBow':
      case 'sit':
      case 'fish': {
        const c = this.claimCushion();
        if (c < 0 || (this.task === 'fish' && rnd() < 0.5)) {
          this.releaseCushion();
          this.goTo(courtPoint());
        } else this.goTo(SPOTS.cushions[c]);
        break;
      }
      case 'gate': this.goTo({ x: (rnd() - 0.5) * 8, z: 37 + rnd() * 6 }); break;
      default: this.goTo(courtPoint());
    }
  }

  private arrive() {
    switch (this.task) {
      case 'incense': this.faceRy = Math.PI; this.monk.setAct('incense'); this.timer = ACT_DURATION.incense! + 1; break;
      case 'cushionBow': this.faceRy = Math.PI; this.repeat = 3 + Math.floor(rnd() * 4); this.monk.setAct('bow'); this.timer = ACT_DURATION.bow!; break;
      case 'sweep': this.monk.setAct('sweep'); this.timer = 6 + rnd() * 6; break;
      case 'beads': this.monk.setAct('beads'); this.timer = 15 + rnd() * 15; break;
      case 'sit': this.faceRy = this.cushion >= 0 ? Math.PI : null; this.monk.setAct('sit'); this.timer = 20 + rnd() * 25; break;
      case 'fish': if (this.cushion >= 0) this.faceRy = Math.PI; this.monk.setAct('fish'); this.timer = 10 + rnd() * 12; break;
      case 'chant': this.faceRy = Math.PI; this.monk.setAct(this.cushion >= 0 ? 'sit' : 'palms'); this.timer = 9999; break;
      default: this.timer = 3 + rnd() * 6;
    }
  }

  /** Turn toward someone and return their 合十. */
  greet(from: THREE.Vector3): boolean {
    if (this.monk.act === 'bow' || this.monk.act === 'incense' || this.task === 'chant') return false;
    this.resume = this.monk.act === 'walk' ? 'idle' : this.monk.act;
    this.faceRy = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    this.monk.setAct('greet');
    this.timer = Math.max(this.timer, ACT_DURATION.greet!);
    return true;
  }

  update(dt: number, chanting: boolean) {
    if (chanting !== (this.task === 'chant')) {
      this.path = [];
      this.choose(chanting);
    }
    if (this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      this.walkT += dt;
      if (this.walkT > 20) {
        // stuck somewhere: give up on this errand
        this.path = [];
        this.choose(chanting);
      } else if (d < 0.25) {
        this.walkT = 0;
        this.path.shift();
        if (!this.path.length) {
          this.monk.setAct('idle');
          this.arrive();
        }
      } else {
        let dir = Math.atan2(dx, dz);
        const step = Math.min(d, 1.45 * dt);
        const here = regionOf(this.pos.x, this.pos.z), there = regionOf(tgt.x, tgt.z);
        // simple steering around obstacles
        for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
          const a = dir + off;
          const nx = this.pos.x + Math.sin(a) * step, nz = this.pos.z + Math.cos(a) * step;
          const r = regionOf(nx, nz);
          const wrongFloor = r !== here && r !== there; // e.g. cutting across the raised hall
          if ((!blocked(nx, nz) && !wrongFloor) || d < 1.0) {
            dir = a;
            this.place(nx, nz);
            break;
          }
        }
        this.turnTo(dir, dt);
        this.monk.setAct('walk');
      }
    } else {
      this.timer -= dt;
      if (this.faceRy !== null) this.turnTo(this.faceRy, dt);
      const act = this.monk.act;
      if (act === 'fish') {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.65;
          this.monk.strike();
          this.onFish(this);
        }
      } else if (act === 'beads') {
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.9;
          this.monk.flick();
        }
      } else if (act === 'greet' && this.monk.actT > ACT_DURATION.greet!) {
        this.monk.setAct(this.resume ?? 'idle');
        this.resume = null;
        if (this.task === 'stroll') this.faceRy = null;
      } else if (act === 'bow' && this.monk.actT > ACT_DURATION.bow!) {
        if (--this.repeat > 0) {
          this.monk.setAct('idle');
          this.monk.setAct('bow');
          this.timer = ACT_DURATION.bow!;
        } else this.timer = 0;
      }
      if (this.timer <= 0) this.choose(chanting);
    }
    this.monk.update(dt, this.path.length ? 1 : 0);
  }

  private turnTo(ry: number, dt: number) {
    const r = this.monk.root.rotation;
    const diff = Math.atan2(Math.sin(ry - r.y), Math.cos(ry - r.y));
    r.y += diff * Math.min(1, dt * 6);
  }
}

/** Another real player, drawn from presence snapshots. */
export class Remote {
  monk: Monk;
  private target = new THREE.Vector3();
  private targetRy = 0;
  lastSeen = 0;
  constructor(public id: string, public name: DharmaName, look: { robe: string }) {
    this.monk = new Monk({ robe: look.robe, beads: 'wood', accessory: 'none' });
  }
  setState(x: number, z: number, ry: number, act: Act, robe: string, first: boolean) {
    this.target.set(x, walkHeight(x, z), z);
    this.targetRy = ry;
    if (first) {
      this.monk.root.position.copy(this.target);
      this.monk.root.rotation.y = ry;
    }
    this.monk.setLook({ robe, beads: 'wood', accessory: 'none' });
    this.remoteAct = act;
  }
  private remoteAct: Act = 'idle';
  update(dt: number) {
    const p = this.monk.root.position;
    const d = p.distanceTo(this.target);
    p.lerp(this.target, Math.min(1, dt * 2.5));
    const r = this.monk.root.rotation;
    r.y += Math.atan2(Math.sin(this.targetRy - r.y), Math.cos(this.targetRy - r.y)) * Math.min(1, dt * 5);
    this.monk.setAct(d > 0.15 ? 'walk' : this.remoteAct === 'walk' ? 'idle' : this.remoteAct);
    this.monk.update(dt, d > 0.15 ? 1 : 0);
  }
}
