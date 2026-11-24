// The little novice monk (小和尚): a chibi figure posed procedurally.
// Poses are written as hand targets (where each hand should be), which keeps
// actions like 合十 easy to author; arm angles are solved from those targets.
import * as THREE from 'three';

export type Act =
  | 'idle' | 'walk' | 'bow' | 'palms' | 'greet' | 'fish' | 'beads' | 'sweep' | 'carry'
  | 'incense' | 'sit' | 'draw' | 'pour' | 'ring' | 'read';

export interface Look { robe: string; beads: string; accessory: string }

export const ACT_DURATION: Partial<Record<Act, number>> = {
  bow: 3.4, palms: 2.4, greet: 2.0, sweep: 2.4, incense: 4.2, draw: 1.6, pour: 1.8, ring: 1.4,
};

export const ROBES: Record<string, { main: string; trim: string; sash?: string }> = {
  grey: { main: '#8e8b85', trim: '#5f5c57' },
  ochre: { main: '#b8783f', trim: '#7b4a24' },
  indigo: { main: '#46577f', trim: '#2c3756' },
  apricot: { main: '#e3a63f', trim: '#9b5a1e', sash: '#b4472a' },
  crimson: { main: '#9c3027', trim: '#5e1a14', sash: '#e0a33e' },
  golden: { main: '#e2b244', trim: '#8a2b1f', sash: '#b8302a' },
};
export const BEAD_COLORS: Record<string, string> = {
  wood: '#7a4e2d', bodhi: '#dcc8a0', sandal: '#a0603a', jade: '#4e9b7c', crystal: '#cfeaf6', amber: '#e09224',
};

const SKIN = '#f6d6bb';
const ARM_LEN = 0.33;
const SHOULDER = new THREE.Vector3(0.2, 0.26, 0);
const WAIST_Y = 0.48;

type Vec = [number, number, number];
interface Pose { L: Vec; R: Vec; bend: number; kneel: number; head: number; yaw: number; closed: boolean }
const P = (L: Vec, R: Vec, o: Partial<Pose> = {}): Pose => ({ L, R, bend: 0, kneel: 0, head: 0, yaw: 0, closed: false, ...o });
const IDLE = P([0.27, -0.05, 0.05], [-0.27, -0.05, 0.05]);
const PALMS = P([0, 0.17, 0.27], [0, 0.17, 0.27], { closed: true });

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    L: [l(a.L[0], b.L[0]), l(a.L[1], b.L[1]), l(a.L[2], b.L[2])],
    R: [l(a.R[0], b.R[0]), l(a.R[1], b.R[1]), l(a.R[2], b.R[2])],
    bend: l(a.bend, b.bend), kneel: l(a.kneel, b.kneel), head: l(a.head, b.head), yaw: l(a.yaw, b.yaw),
    closed: t < 0.5 ? a.closed : b.closed,
  };
}
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Piecewise keyframes: [time, pose][] */
function keyed(keys: [number, Pose][], t: number): Pose {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1];
      const [t1, b] = keys[i];
      return lerpPose(a, b, ease((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

const BOW_KEYS: [number, Pose][] = [
  [0, IDLE],
  [0.5, PALMS],
  [1.1, P([0, 0.17, 0.27], [0, 0.17, 0.27], { kneel: 1, closed: true })],
  [1.7, P([0.14, -0.02, 0.32], [-0.14, -0.02, 0.32], { kneel: 1, bend: 1.15, head: 0.2, closed: true })],
  [2.3, P([0.14, -0.02, 0.32], [-0.14, -0.02, 0.32], { kneel: 1, bend: 1.15, head: 0.2, closed: true })],
  [2.9, P([0, 0.17, 0.27], [0, 0.17, 0.27], { kneel: 0.2, closed: true })],
  [3.4, IDLE],
];
const INCENSE_UP = P([0.02, 0.36, 0.22], [-0.02, 0.36, 0.22], { closed: true });
const INCENSE_DOWN = P([0.02, 0.2, 0.28], [-0.02, 0.2, 0.28], { closed: true, bend: 0.35 });
const INCENSE_KEYS: [number, Pose][] = [
  [0, IDLE], [0.5, INCENSE_UP], [1.0, INCENSE_DOWN], [1.5, INCENSE_UP], [2.0, INCENSE_DOWN], [2.5, INCENSE_UP],
  [3.3, P([0.05, 0.05, 0.33], [-0.02, 0.2, 0.28], { bend: 0.3 })], [4.2, IDLE],
];

function aim(arm: THREE.Object3D, hand: Vec, side: 1 | -1, out: THREE.Vector3) {
  out.set(hand[0] - SHOULDER.x * side, hand[1] - SHOULDER.y, hand[2] - SHOULDER.z);
  out.normalize();
  arm.rotation.z = Math.asin(THREE.MathUtils.clamp(out.x, -1, 1));
  arm.rotation.x = Math.atan2(-out.z, -out.y);
}

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const skinMat = std(SKIN, { roughness: 0.6 });
const darkMat = std('#2b2522');
const blushMat = new THREE.MeshBasicMaterial({ color: '#f39a9a', transparent: true, opacity: 0.45, depthWrite: false });
const woodMat = std('#8a5a33');
const strawMat = std('#c9a560');

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Monk {
  root = new THREE.Group();
  labelAnchor = new THREE.Object3D();
  act: Act = 'idle';
  actT = 0;
  private body = new THREE.Group();
  private waist = new THREE.Group();
  private head = new THREE.Group();
  private skirt: THREE.Mesh;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private handL = new THREE.Object3D();
  private handR = new THREE.Object3D();
  private feet: THREE.Mesh[] = [];
  private eyesOpen = new THREE.Group();
  private eyesClosed = new THREE.Group();
  private robeMat = std('#8e8b85');
  private trimMat = std('#5f5c57');
  private sashMat = std('#b4472a');
  private sash: THREE.Mesh;
  private beadMat = std('#7a4e2d', { roughness: 0.4 });
  private props: Record<string, THREE.Object3D> = {};
  private accessories: Record<string, THREE.Object3D> = {};
  private look: Look = { robe: 'grey', beads: 'wood', accessory: 'none' };
  private pose: Pose = { ...IDLE };
  private walkPhase = 0;
  private strikeT = 9;
  private beadT = 9;
  private blinkT = 2 + Math.random() * 3;
  private tmp = new THREE.Vector3();

  constructor(look?: Look) {
    this.root.add(this.body);
    this.body.add(this.waist);
    this.waist.position.y = WAIST_Y;

    // robe skirt
    const skirtProf = [[0, 0], [0.37, 0], [0.36, 0.06], [0.31, 0.3], [0.27, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
    this.skirt = mesh(this.body, new THREE.LatheGeometry(skirtProf, 20), this.robeMat);
    const hem = mesh(this.body, new THREE.TorusGeometry(0.36, 0.025, 6, 24), this.trimMat, 0, 0.04, 0);
    hem.rotation.x = Math.PI / 2;
    this.skirt.add(hem);
    hem.position.set(0, 0.04, 0);
    for (const s of [1, -1]) {
      const f = mesh(this.body, new THREE.SphereGeometry(0.08, 10, 6), darkMat, s * 0.11, 0.035, 0.12);
      f.scale.set(1, 0.6, 1.5);
      this.feet.push(f);
    }

    // torso
    const torsoProf = [[0, 0], [0.27, 0], [0.25, 0.14], [0.2, 0.28], [0.11, 0.35], [0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y));
    mesh(this.waist, new THREE.LatheGeometry(torsoProf, 20), this.robeMat);
    const belt = mesh(this.waist, new THREE.TorusGeometry(0.265, 0.03, 6, 24), this.trimMat, 0, 0.02, 0);
    belt.rotation.x = Math.PI / 2;
    // crossed collar (交领): two flat bands meeting in a V
    for (const s of [1, -1]) {
      const band = mesh(this.waist, new THREE.BoxGeometry(0.05, 0.3, 0.02), this.trimMat, s * 0.06, 0.2, 0.19);
      band.rotation.set(-0.35, 0, s * 0.55);
    }
    // kasaya sash for senior robes
    this.sash = mesh(this.waist, new THREE.TorusGeometry(0.26, 0.045, 6, 24), this.sashMat, 0, 0.17, 0);
    this.sash.rotation.set(Math.PI / 2, 0.6, 0);
    this.sash.scale.set(1, 1.05, 1);
    // mala around the neck
    const mala = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4), this.beadMat, 22);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const y = 0.3 - (Math.cos(a) * 0.5 + 0.5) * 0.18;
      m.makeTranslation(Math.sin(a) * 0.17, y, Math.cos(a) * 0.11 + 0.08 + (Math.cos(a) > 0 ? Math.cos(a) * 0.07 : 0));
      mala.setMatrixAt(i, m);
    }
    this.waist.add(mala);

    // head
    this.head.position.y = 0.6;
    this.waist.add(this.head);
    const skull = mesh(this.head, new THREE.SphereGeometry(0.31, 24, 18), skinMat);
    skull.scale.set(1, 0.95, 0.96);
    for (const s of [1, -1]) {
      const ear = mesh(this.head, new THREE.SphereGeometry(0.07, 10, 8), skinMat, s * 0.3, -0.02, 0);
      ear.scale.set(0.5, 1, 0.8);
      const eye = mesh(this.eyesOpen, new THREE.SphereGeometry(0.034, 10, 8), darkMat, s * 0.1, -0.01, 0.285);
      eye.scale.set(0.9, 1.25, 0.5);
      const hl = mesh(this.eyesOpen, new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), s * 0.1 + 0.01, 0.005, 0.3);
      hl.castShadow = false;
      const closed = mesh(this.eyesClosed, new THREE.TorusGeometry(0.035, 0.009, 4, 10, Math.PI), darkMat, s * 0.1, 0.0, 0.29);
      closed.rotation.z = Math.PI;
      const blush = mesh(this.head, new THREE.CircleGeometry(0.05, 14), blushMat, s * 0.17, -0.09, 0.255);
      blush.castShadow = false;
      blush.lookAt(this.tmp.set(s * 0.17, -0.09, 0.255).multiplyScalar(2));
    }
    const mouth = mesh(this.head, new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), std('#b5544a'), 0, -0.12, 0.28);
    mouth.rotation.z = Math.PI;
    this.head.add(this.eyesOpen, this.eyesClosed);
    this.labelAnchor.position.y = 0.55;
    this.head.add(this.labelAnchor);

    // arms
    for (const [arm, hand, s] of [[this.armL, this.handL, 1], [this.armR, this.handR, -1]] as const) {
      arm.position.set(SHOULDER.x * s, SHOULDER.y, SHOULDER.z);
      this.waist.add(arm);
      const sleeve = mesh(arm, new THREE.CylinderGeometry(0.065, 0.1, 0.27, 10), this.robeMat, 0, -0.135, 0);
      sleeve.castShadow = true;
      const cuff = mesh(arm, new THREE.TorusGeometry(0.095, 0.018, 5, 14), this.trimMat, 0, -0.265, 0);
      cuff.rotation.x = Math.PI / 2;
      mesh(arm, new THREE.SphereGeometry(0.058, 10, 8), skinMat, 0, -ARM_LEN + 0.02, 0);
      hand.position.y = -ARM_LEN;
      arm.add(hand);
    }

    this.buildProps();
    this.buildAccessories();
    this.setLook(look ?? this.look);
  }

  private buildProps() {
    // wooden fish in the left hand, mallet in the right
    const fish = new THREE.Group();
    const fb = mesh(fish, new THREE.SphereGeometry(0.11, 14, 10), std('#8d3b22', { roughness: 0.45 }), 0, 0.02, 0.06);
    fb.scale.set(1.15, 0.85, 1);
    const slot = mesh(fish, new THREE.BoxGeometry(0.16, 0.012, 0.03), darkMat, 0, 0.02, 0.165);
    slot.castShadow = false;
    this.handL.add(fish);
    const mallet = new THREE.Group();
    mesh(mallet, new THREE.CylinderGeometry(0.01, 0.01, 0.2), woodMat, 0, 0, 0.08).rotation.x = Math.PI / 2;
    mesh(mallet, new THREE.SphereGeometry(0.03, 8, 6), woodMat, 0, 0, 0.18);
    this.handR.add(mallet);
    this.props.fish = fish;
    this.props.mallet = mallet;

    // broom held in the right hand, reaching down to the ground
    const broom = new THREE.Group();
    mesh(broom, new THREE.CylinderGeometry(0.015, 0.015, 1.0), strawMat, 0, -0.25, 0.05);
    const brush = mesh(broom, new THREE.ConeGeometry(0.16, 0.32, 8), std('#a88c4c'), 0, -0.85, 0.05);
    brush.scale.set(1, 1, 0.4);
    this.handR.add(broom);
    this.props.broom = broom;

    // shoulder yoke with two buckets
    const yoke = new THREE.Group();
    mesh(yoke, new THREE.CylinderGeometry(0.018, 0.018, 1.3), woodMat, 0, 0, 0).rotation.z = Math.PI / 2;
    for (const s of [1, -1]) {
      mesh(yoke, new THREE.CylinderGeometry(0.004, 0.004, 0.45), darkMat, s * 0.6, -0.22, 0);
      mesh(yoke, new THREE.CylinderGeometry(0.11, 0.09, 0.18, 10), woodMat, s * 0.6, -0.5, 0);
      const w = mesh(yoke, new THREE.CircleGeometry(0.1, 10), std('#5d8f9a', { roughness: 0.2 }), s * 0.6, -0.42, 0);
      w.rotation.x = -Math.PI / 2;
    }
    yoke.position.set(0, 0.34, -0.02);
    this.waist.add(yoke);
    this.props.yoke = yoke;

    // incense sticks
    const sticks = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      mesh(sticks, new THREE.CylinderGeometry(0.006, 0.006, 0.36), std('#b34a2a'), i * 0.02, 0.17, 0.0);
      mesh(sticks, new THREE.SphereGeometry(0.012, 5, 4), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }), i * 0.02, 0.35, 0);
    }
    this.handL.add(sticks);
    this.props.sticks = sticks;

    // bead loop in the right hand
    const loop = mesh(this.handR, new THREE.TorusGeometry(0.07, 0.016, 6, 18), this.beadMat, 0, -0.06, 0.02);
    this.props.loop = loop;

    // scroll
    const scroll = new THREE.Group();
    const paper = mesh(scroll, new THREE.PlaneGeometry(0.3, 0.2), std('#efe3c4', { side: THREE.DoubleSide }), 0, 0, 0.04);
    paper.rotation.x = -0.9;
    this.handL.add(scroll);
    this.props.scroll = scroll;
  }

  private buildAccessories() {
    const hat = new THREE.Group();
    const cone = mesh(hat, new THREE.ConeGeometry(0.5, 0.2, 18), strawMat, 0, 0.3, 0);
    cone.scale.y = 1;
    mesh(hat, new THREE.TorusGeometry(0.5, 0.012, 4, 24), std('#8a6c35'), 0, 0.2, 0).rotation.x = Math.PI / 2;
    hat.rotation.x = -0.12;
    this.head.add(hat);
    this.accessories.hat = hat;

    const satchel = new THREE.Group();
    mesh(satchel, new THREE.BoxGeometry(0.2, 0.18, 0.08), std('#8b6f4e'), 0.27, -0.02, 0.05);
    const strap = mesh(satchel, new THREE.TorusGeometry(0.3, 0.012, 4, 24), std('#6d5338'), 0, 0.15, 0);
    strap.rotation.set(Math.PI / 2, -0.7, 0);
    this.waist.add(satchel);
    this.accessories.satchel = satchel;

    const staff = new THREE.Group();
    mesh(staff, new THREE.CylinderGeometry(0.016, 0.016, 1.5), woodMat, 0, 0.3, 0.03);
    mesh(staff, new THREE.TorusGeometry(0.08, 0.012, 5, 14), std('#c9a14b', { metalness: 0.8, roughness: 0.3 }), 0, 1.08, 0.03);
    for (const s of [1, -1]) mesh(staff, new THREE.TorusGeometry(0.03, 0.006, 4, 10), std('#c9a14b', { metalness: 0.8 }), s * 0.07, 1.0, 0.03);
    this.handR.add(staff);
    this.accessories.staff = staff;

    const lantern = new THREE.Group();
    mesh(lantern, new THREE.CylinderGeometry(0.006, 0.006, 0.2), darkMat, 0, -0.1, 0.03);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = mesh(lantern, new THREE.SphereGeometry(0.05, 6, 5), std('#f4a9bb', { emissive: '#ff8fa8', emissiveIntensity: 0.35 }), Math.cos(a) * 0.05, -0.25, 0.03 + Math.sin(a) * 0.05);
      p.scale.set(0.5, 1.2, 0.8);
      p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    mesh(lantern, new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffe08a' }), 0, -0.24, 0.03);
    this.handL.add(lantern);
    this.accessories.lantern = lantern;

    const whisk = new THREE.Group();
    mesh(whisk, new THREE.CylinderGeometry(0.012, 0.012, 0.22), woodMat, 0, 0.0, 0.05);
    const tuft = mesh(whisk, new THREE.ConeGeometry(0.06, 0.32, 8), std('#f5f2ea'), 0, -0.25, 0.05);
    tuft.rotation.x = Math.PI;
    this.handR.add(whisk);
    this.accessories.whisk = whisk;
  }

  setLook(look: Look) {
    this.look = { ...look };
    const robe = ROBES[look.robe] ?? ROBES.grey;
    this.robeMat.color.set(robe.main);
    this.trimMat.color.set(robe.trim);
    this.sash.visible = !!robe.sash;
    if (robe.sash) this.sashMat.color.set(robe.sash);
    this.sashMat.metalness = look.robe === 'golden' ? 0.4 : 0;
    this.beadMat.color.set(BEAD_COLORS[look.beads] ?? BEAD_COLORS.wood);
    this.beadMat.transparent = look.beads === 'crystal';
    this.beadMat.opacity = look.beads === 'crystal' ? 0.75 : 1;
    this.refreshProps();
  }

  setAct(act: Act) {
    if (this.act === act) return;
    this.act = act;
    this.actT = 0;
    this.refreshProps();
  }

  /** Visual tap of the mallet. */
  strike() {
    this.strikeT = 0;
  }
  /** Visual flick of a bead. */
  flick() {
    this.beadT = 0;
  }

  private refreshProps() {
    const a = this.act;
    this.props.fish.visible = this.props.mallet.visible = a === 'fish';
    this.props.broom.visible = a === 'sweep';
    this.props.yoke.visible = a === 'carry' || a === 'pour';
    this.props.sticks.visible = a === 'incense';
    this.props.loop.visible = a === 'beads';
    this.props.scroll.visible = a === 'read';
    const handsBusy = !['idle', 'walk', 'sit'].includes(a);
    for (const [k, obj] of Object.entries(this.accessories)) {
      const hand = k === 'staff' || k === 'lantern' || k === 'whisk';
      obj.visible = this.look.accessory === k && !(hand && handsBusy) && !(k === 'staff' && a === 'sit');
    }
  }

  private target(dt: number, speed: number): Pose {
    const t = this.actT;
    switch (this.act) {
      case 'walk': {
        this.walkPhase += dt * (4 + speed * 2.4);
        const s = Math.sin(this.walkPhase);
        return P([0.27, -0.05, 0.05 - s * 0.12], [-0.27, -0.05, 0.05 + s * 0.12], { bend: 0.06 });
      }
      case 'bow': return keyed(BOW_KEYS, t);
      case 'palms': return keyed([[0, IDLE], [0.4, PALMS], [2.0, PALMS], [2.4, IDLE]], t);
      case 'greet': return keyed([[0, IDLE], [0.35, PALMS], [0.8, { ...PALMS, bend: 0.4 }], [1.5, PALMS], [2.0, IDLE]], t);
      case 'fish': {
        const k = Math.max(0, 1 - this.strikeT / 0.12);
        return P([0.06, 0.0, 0.3], [-0.08, 0.14 - k * 0.1, 0.27 + k * 0.04], { closed: true, head: 0.15 });
      }
      case 'beads': {
        const k = Math.max(0, 1 - this.beadT / 0.15);
        return P([0.07, -0.02, 0.27], [-0.05, 0.03 + k * 0.03, 0.28], { closed: true, head: 0.12 });
      }
      case 'sweep': {
        const s = Math.sin(t * 5.2);
        return P([0.05 + s * 0.1, 0.1, 0.3], [-0.03 + s * 0.12, -0.04, 0.32], { bend: 0.3, yaw: s * 0.35 });
      }
      case 'carry': {
        this.walkPhase += dt * (4 + speed * 2.4);
        return P([0.3, 0.32, 0.06], [-0.3, 0.32, 0.06], { bend: 0.04 });
      }
      case 'pour': return keyed([[0, P([0.3, 0.32, 0.06], [-0.3, 0.32, 0.06])], [0.6, P([0.3, 0.32, 0.06], [-0.3, 0.32, 0.06], { bend: 0.55 })], [1.4, P([0.3, 0.32, 0.06], [-0.3, 0.32, 0.06], { bend: 0.55 })], [1.8, IDLE]], t);
      case 'draw': {
        const s = Math.sin(t * 7);
        return P([0.06, -0.02 + s * 0.08, 0.33], [-0.06, 0.06 - s * 0.08, 0.33], { bend: 0.45 });
      }
      case 'incense': return keyed(INCENSE_KEYS, t);
      case 'ring': return keyed([[0, IDLE], [0.4, P([0.1, 0.12, 0.33], [-0.1, 0.12, 0.33], { bend: -0.15 })], [0.7, P([0.1, 0.1, 0.33], [-0.1, 0.1, 0.33], { bend: 0.35 })], [1.4, IDLE]], t);
      case 'read': return P([0.1, 0.05, 0.28], [-0.12, 0.05, 0.28], { head: 0.35, bend: 0.08 });
      case 'sit': return P([0.02, -0.12, 0.2], [-0.02, -0.12, 0.2], { kneel: 1, closed: true, head: 0.05 });
      default: return IDLE;
    }
  }

  update(dt: number, speed = 0) {
    this.actT += dt;
    this.strikeT += dt;
    this.beadT += dt;
    const tgt = this.target(dt, speed);
    const k = 1 - Math.exp(-dt * 14);
    this.pose = lerpPose(this.pose, tgt, k);
    this.pose.closed = tgt.closed;
    const p = this.pose;

    // breathing + walk bob
    const moving = this.act === 'walk' || this.act === 'carry';
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : Math.sin(this.actT * 1.6) * 0.006;
    this.body.position.y = bob;
    this.skirt.scale.set(1 + p.kneel * 0.18, 1 - p.kneel * 0.5, 1 + p.kneel * 0.18);
    this.waist.position.y = WAIST_Y - p.kneel * 0.25;
    this.waist.rotation.set(p.bend, p.yaw, moving ? Math.sin(this.walkPhase) * 0.05 : 0);
    this.head.rotation.x = p.head;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      f.visible = p.kneel < 0.5;
      f.position.z = 0.12 + (moving ? Math.sin(this.walkPhase + i * Math.PI) * 0.1 : 0);
      f.position.y = 0.035 + (moving ? Math.max(0, Math.cos(this.walkPhase + i * Math.PI)) * 0.04 : 0);
    }
    aim(this.armL, p.L, 1, this.tmp);
    aim(this.armR, p.R, -1, this.tmp);

    // blink
    this.blinkT -= dt;
    const blinking = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 4;
    const closed = p.closed || blinking;
    this.eyesOpen.visible = !closed;
    this.eyesClosed.visible = closed;
  }
}
