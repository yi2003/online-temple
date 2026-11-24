// The running world: scene, player, residents, interactions, chanting, presence.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sound } from './audio/audio.ts';
import { chantState, PHRASES, SYLLABLE_SECONDS, type ChantState } from './chant.ts';
import { getLang, t, type Key } from './i18n.ts';
import { isUnlocked, rankIndex, RANKS, UNLOCKS, type AreaId } from './state/progress.ts';
import { nameFromIndices } from './state/names.ts';
import { store } from './state/store.ts';
import { CameraRig, Input, Player } from './world/controls.ts';
import { buildFarMountains, buildLights, buildSky, buildTerrain, FOG_COLOR, fbm, insideAnyZone, Mist, terrainY } from './world/environment.ts';
import { Labels } from './world/labels.ts';
import { circle, SPOTS, SUMMIT_Y, TERRACE_Y, ZONES } from './world/layout.ts';
import { ACT_DURATION, Monk, type Act } from './world/monk.ts';
import { Bamboo, blossomTrees, grassTufts, Pines, rocks } from './world/nature.ts';
import { cushionTaken, Remote, Resident } from './world/npcs.ts';
import { Temple } from './world/temple.ts';

type Mode = 'free' | 'busy' | 'carry' | 'repeatBow' | 'sit' | 'beads' | 'fish' | 'read';

interface Interaction {
  key: Key;
  x: number;
  y: number;
  z: number;
  r: number;
  run: () => void;
}

export interface RemoteState { id: string; n: [number, number]; x: number; z: number; ry: number; act: Act; robe: string }

export interface GameEvents {
  toast(msg: string | { key: Key; vars?: Record<string, string | number> }): void;
  context(key: Key | null): void;
  modeChanged(mode: Mode): void;
  chant(state: ChantState): void;
  repeatBow(count: number): void;
  openSutra(): void;
}

const mobile = matchMedia('(pointer: coarse)').matches;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 2000);
  input: Input;
  player: Player;
  rig: CameraRig;
  temple: Temple;
  labels = new Labels();
  mode: Mode = 'free';
  private sun: THREE.DirectionalLight;
  private mist = new Mist();
  private bamboo!: Bamboo;
  private residents: Resident[] = [];
  private remotes = new Map<string, Remote>();
  private clock = new THREE.Clock();
  private busy: { until: number; t: number; events: [number, () => void][]; done: () => void } | null = null;
  private interaction: Interaction | null = null;
  private lastChantBeat = -1;
  private chantWasActive = false;
  private sitT = 0;
  private bowCount = 0;
  private bellCooldown = 0;
  private lockedToastT = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement, private ev: GameEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.scene.fog = new THREE.Fog(FOG_COLOR, 45, 260);
    this.scene.background = FOG_COLOR;

    this.sun = buildLights(this.scene, mobile ? 'low' : 'high');
    this.scene.add(buildSky(), buildFarMountains(), this.mist.group, buildTerrain());
    this.temple = new Temple();
    this.scene.add(this.temple.group);
    this.plantNature();

    const p = store.progress;
    const monk = new Monk({ ...p.equip });
    this.scene.add(monk.root);
    this.player = new Player(monk, (a) => this.areaOpen(a));
    this.player.place(SPOTS.spawn.x, SPOTS.spawn.z, Math.PI);
    this.player.onStep = () => sound.step();
    this.input = new Input(canvas);
    this.rig = new CameraRig(this.camera, this.temple.occluders, (x, z) => terrainY(x, z));
    this.rig.snap(this.player.pos);

    for (let i = 0; i < 7; i++) {
      const r = new Resident(i);
      r.onFish = (m) => {
        const d = m.pos.distanceTo(this.player.pos);
        if (d < 10) sound.woodfish(0, 'sfx', 0.12 * (1 - d / 10));
      };
      this.residents.push(r);
      this.scene.add(r.monk.root);
    }

    this.refreshFromStore();
    store.on((e) => {
      if (e.type === 'change') this.refreshFromStore();
    });
    addEventListener('resize', () => this.resize());
  }

  private areaOpen(a: AreaId): boolean {
    return isUnlocked(store.progress.xp, 'area', a);
  }

  refreshFromStore() {
    const p = store.progress;
    this.player.monk.setLook({ ...p.equip });
    this.temple.setUnlocked((a) => this.areaOpen(a));
    this.temple.setLeafPiles(p.daily.date, p.daily.counts.sweep ?? 0);
    this.temple.setVatLevel(p.daily.counts.water ?? 0);
    this.labels.set('me', this.player.monk.labelAnchor, `${p.name.zh} ${p.name.en}`, true);
    for (const r of this.residents) this.labels.set(r.id, r.monk.labelAnchor, `${r.name.zh} ${r.name.en}`);
  }

  private plantNature() {
    const rr = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const pines: { x: number; y: number; z: number; s?: number }[] = [
      ...[[-17, -19], [17, -19], [-17, 13], [17, 13], [-19, 0], [19, 6]].map(([x, z]) => ({ x, y: 0, z, s: 1.15 })),
      { x: -12, y: TERRACE_Y, z: -48.5 }, { x: 15, y: TERRACE_Y, z: -49 }, { x: 18.5, y: SUMMIT_Y, z: -74, s: 1.3 },
      { x: 35.5, y: 0, z: -11 }, { x: 28, y: 0, z: 7 },
    ];
    for (let i = 0; i < 900 && pines.length < 170; i++) {
      const x = -110 + rr() * 220, z = -130 + rr() * 200;
      if (insideAnyZone(x, z, 1.5)) continue;
      if (Math.abs(x) < 7 && z > 18 && z < 50) continue; // keep the approach open
      const y = terrainY(x, z);
      if (y < -30) continue;
      if (fbm(x * 0.05, z * 0.05) < 0.42) continue; // clustered groves
      pines.push({ x, y, z });
    }
    this.scene.add(new Pines(pines).group);

    // bamboo grove, leaving a winding path to the meditation stone
    const path = [{ x: -37, z: 15 }, { x: -34, z: 22 }, { x: -36.5, z: 28 }, { x: -37, z: 31 }];
    const nearPath = (x: number, z: number) => path.some((p, i) => {
      const q = path[i + 1];
      if (!q) return Math.hypot(x - p.x, z - p.z) < 3.2;
      const t = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (z - p.z) * (q.z - p.z)) / ((q.x - p.x) ** 2 + (q.z - p.z) ** 2)));
      return Math.hypot(x - (p.x + (q.x - p.x) * t), z - (p.z + (q.z - p.z) * t)) < 2.2;
    });
    const clumps: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 400 && clumps.length < 55; i++) {
      const x = -54 + rr() * 34, z = 18.5 + rr() * 28;
      if (nearPath(x, z) || (x > -24 && z < 21)) continue;
      if (clumps.some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)) continue;
      clumps.push({ x, y: terrainY(x, z), z });
      if (insideAnyZone(x, z)) circle(x, z, 0.75);
    }
    this.bamboo = new Bamboo(clumps);
    this.scene.add(this.bamboo.group);

    const blossoms = [{ x: -44, z: 8 }, { x: -29, z: -14 }, { x: -45, z: -13 }, { x: -29, z: 9 }];
    for (const b of blossoms) circle(b.x, b.z, 0.35);
    this.scene.add(blossomTrees(blossoms.map((b) => ({ ...b, y: 0 }))));

    const rockSpots: { x: number; y: number; z: number; s: number }[] = [
      { x: SPOTS.bambooSeat.x, y: 0, z: SPOTS.bambooSeat.z - 1.2, s: 0.9 },
      { x: -40.5, y: 0, z: 33, s: 0.7 }, { x: -46, y: 0, z: -2, s: 1.1 }, { x: 36, y: 0, z: 5, s: 0.8 },
    ];
    for (let i = 0; i < 260 && rockSpots.length < 90; i++) {
      const x = -90 + rr() * 180, z = -110 + rr() * 170;
      if (insideAnyZone(x, z, 1)) continue;
      rockSpots.push({ x, y: terrainY(x, z), z, s: 0.5 + rr() * 2.2 });
    }
    this.scene.add(rocks(rockSpots));

    const tufts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 6000 && tufts.length < 1400; i++) {
      const x = -60 + rr() * 110, z = -85 + rr() * 135;
      const inZone = insideAnyZone(x, z);
      const zone = ZONES.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1);
      if (inZone && !(zone && ['pond', 'bamboo', 'bell'].includes(zone.name))) continue;
      if (zone?.name === 'pond' && Math.hypot(x - SPOTS.pond.x, z - SPOTS.pond.z) < SPOTS.pond.r + 1) continue;
      if (zone?.name === 'bamboo' && nearPath(x, z) && rr() < 0.8) continue;
      if (zone?.name === 'bell' && x > 24.5 && x < 37.5 && z > -9.5 && z < 5.5) continue; // paved
      if (!inZone && !insideAnyZone(x, z, 12)) continue;
      tufts.push({ x, y: terrainY(x, z), z });
    }
    this.scene.add(grassTufts(tufts));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---------- player modes and actions ----------
  private setMode(m: Mode) {
    this.mode = m;
    this.player.frozen = m !== 'free' && m !== 'carry';
    this.ev.modeChanged(m);
  }

  /** Run a one-shot animation; `events` fire at given times; `done` at the end. */
  private perform(act: Act, events: [number, () => void][] = [], done: () => void = () => {}, after: Mode = 'free') {
    const dur = ACT_DURATION[act] ?? 1.5;
    this.player.monk.setAct('idle');
    this.player.monk.setAct(act);
    this.busy = { until: dur, t: 0, events: [...events].sort((a, b) => a[0] - b[0]), done: () => { done(); this.setMode(after); } };
    this.setMode('busy');
  }

  private face(x: number, z: number) {
    this.player.ry = Math.atan2(x - this.player.pos.x, z - this.player.pos.z);
  }

  canAct(): boolean {
    return this.mode === 'free';
  }

  bow() {
    if (!this.canAct()) return;
    this.perform('bow', [[1.7, () => sound.chime(0.5)]], () => this.countBow());
  }

  private countBow() {
    store.update((p) => { p.bows++; });
    store.practise('bow');
  }

  palms() {
    if (!this.canAct()) return;
    const greeted: string[] = [];
    const near = this.residents
      .map((r) => ({ r, d: r.pos.distanceTo(this.player.pos) }))
      .filter((x) => x.d < 6)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    this.perform('palms', [[0.5, () => {
      for (const { r } of near) if (r.greet(this.player.pos)) greeted.push(r.name.zh + ' ' + r.name.en);
      if (greeted.length) this.ev.toast({ key: 'greetBack', vars: { name: greeted[0] } });
    }]]);
  }

  beginBeads(): boolean {
    if (!this.canAct()) return false;
    this.player.monk.setAct('beads');
    this.setMode('beads');
    return true;
  }
  bead() {
    if (this.mode !== 'beads') return;
    this.player.monk.flick();
    sound.bead();
    let wrapped = false;
    const doneBefore = store.progress.daily.done.includes('beads');
    store.update((p) => {
      p.bead = (p.bead + 1) % 108;
      if (p.bead === 0) {
        p.rounds++;
        wrapped = true;
      }
    }, 0);
    if (wrapped) {
      sound.chime(0.75);
      if (doneBefore) store.update(() => {}, 5);
    }
    store.practise('beads');
  }

  beginFish(): boolean {
    if (!this.canAct()) return false;
    this.player.monk.setAct('fish');
    this.setMode('fish');
    return true;
  }
  strikeFish() {
    if (this.mode !== 'fish') return;
    this.player.monk.strike();
    sound.woodfish();
    const doneBefore = store.progress.daily.done.includes('fish');
    store.update((p) => { p.merit++; }, doneBefore && (store.progress.merit + 1) % 108 === 0 ? 5 : 0);
    store.practise('fish');
  }

  endOverlay() {
    if (this.mode === 'beads' || this.mode === 'fish' || this.mode === 'read') {
      this.player.monk.setAct('idle');
      this.setMode('free');
    }
  }

  /** Context button (or E key). */
  interact() {
    if (this.mode === 'repeatBow' || this.mode === 'sit') {
      this.standUp();
      return;
    }
    if (this.interaction && (this.mode === 'free' || this.mode === 'carry')) this.interaction.run();
  }

  private standUp() {
    this.player.monk.setAct('idle');
    this.setMode('free');
  }

  private interactions(): Interaction[] {
    const list: Interaction[] = [];
    const carrying = this.mode === 'carry';
    if (!carrying) {
      for (const pile of this.temple.leafPiles) {
        list.push({ key: 'i_sweep', x: pile.x, y: 0, z: pile.z, r: 1.8, run: () => {
          this.face(pile.x, pile.z);
          this.perform('sweep', [[0.3, () => sound.sweep()], [1.0, () => sound.sweep()], [1.7, () => sound.sweep()]], () => {
            this.temple.removeLeafPile(pile);
            store.practise('sweep');
          });
        } });
      }
      list.push({ key: 'i_well', x: SPOTS.well.x, y: 0, z: SPOTS.well.z, r: 2.2, run: () => {
        this.face(SPOTS.well.x, SPOTS.well.z);
        this.perform('draw', [[0.4, () => sound.water()]], () => {
          this.player.monk.setAct('carry');
          this.ev.toast({ key: 'carrying' });
        }, 'carry');
      } });
      list.push({ key: 'i_incense', x: SPOTS.burner.x, y: 0, z: SPOTS.burner.z, r: 3.0, run: () => {
        this.face(SPOTS.burner.x, SPOTS.burner.z);
        this.perform('incense', [[3.3, () => this.temple.offerIncense()]], () => {
          sound.chime(1);
          store.practise('incense');
        });
      } });
      SPOTS.cushions.forEach((c, i) => {
        if (cushionTaken(i)) return;
        list.push({ key: 'i_cushion', x: c.x, y: 1, z: c.z, r: 1.0, run: () => this.startRepeatBow(c) });
      });
      if (this.areaOpen('bell')) {
        list.push({ key: 'i_bell', x: SPOTS.bellStriker.x, y: 0, z: SPOTS.bellStriker.z, r: 1.8, run: () => {
          if (this.bellCooldown > 0) return;
          this.bellCooldown = 6;
          this.player.place(SPOTS.bellStriker.x - 0.4, SPOTS.bellStriker.z);
          this.face(SPOTS.bell.x, SPOTS.bell.z);
          this.temple.ringBell();
          this.perform('ring', [[0.8, () => sound.bell(1.0)]]);
        } });
      }
      if (this.areaOpen('sutra')) {
        list.push({ key: 'i_sutra', x: SPOTS.lectern.x, y: TERRACE_Y, z: SPOTS.lectern.z, r: 1.6, run: () => {
          this.face(SPOTS.lectern.x, SPOTS.lectern.z - 2);
          this.player.monk.setAct('read');
          this.setMode('read');
          this.ev.openSutra();
        } });
      }
      const seats: [AreaId, { x: number; z: number }, number, number][] = [
        ['pond', SPOTS.pondBench, 0, Math.PI],
        ['bamboo', SPOTS.bambooSeat, 0, Math.PI],
        ['summit', SPOTS.summitSeat, SUMMIT_Y, 0],
      ];
      for (const [area, s, y, ry] of seats) {
        if (!this.areaOpen(area)) continue;
        list.push({ key: 'i_sit', x: s.x, y, z: s.z, r: 1.4, run: () => {
          this.player.place(s.x, s.z, ry);
          this.player.monk.setAct('sit');
          this.sitT = 0;
          this.setMode('sit');
        } });
      }
    } else {
      list.push({ key: 'i_vat', x: SPOTS.vat.x, y: 0, z: SPOTS.vat.z, r: 2.0, run: () => {
        this.face(SPOTS.vat.x, SPOTS.vat.z);
        this.perform('pour', [[0.6, () => sound.water()]], () => store.practise('water'));
      } });
    }
    return list;
  }

  private startRepeatBow(c: { x: number; z: number }) {
    this.player.place(c.x, c.z, Math.PI);
    this.bowCount = 0;
    this.player.monk.setAct('idle');
    this.player.monk.setAct('bow');
    this.setMode('repeatBow');
    this.ev.repeatBow(0);
  }

  // ---------- presence ----------
  presenceState() {
    const m = this.player.monk;
    return { x: this.player.pos.x, z: this.player.pos.z, ry: this.player.ry, act: m.act, robe: store.progress.equip.robe, rank: rankIndex(store.progress.xp) };
  }

  applyRemotes(list: RemoteState[]) {
    const seen = new Set<string>();
    for (const s of list) {
      const name = nameFromIndices(s.n[0], s.n[1]);
      if (!name) continue;
      seen.add(s.id);
      let r = this.remotes.get(s.id);
      const first = !r;
      if (!r) {
        r = new Remote(s.id, name, { robe: s.robe });
        this.remotes.set(s.id, r);
        this.scene.add(r.monk.root);
        this.labels.set(s.id, r.monk.labelAnchor, `${name.zh} ${name.en}`);
      }
      r.setState(s.x, s.z, s.ry, s.act, s.robe, first);
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.scene.remove(r.monk.root);
        this.labels.remove(id);
        this.remotes.delete(id);
      }
    }
    // fewer simulated monks as real ones arrive
    const simCount = Math.max(2, 7 - this.remotes.size);
    this.residents.forEach((r, i) => {
      const show = i < simCount;
      r.monk.root.visible = show;
      if (!show) this.labels.remove(r.id);
      else this.labels.set(r.id, r.monk.labelAnchor, `${r.name.zh} ${r.name.en}`);
    });
  }
  get othersCount() {
    return this.remotes.size;
  }

  // ---------- loop ----------
  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.input.poll();
    const look = this.input.consumeLook();
    const moving = this.input.move.length() > 0.1;

    if (moving && (this.mode === 'repeatBow' || this.mode === 'sit' || this.mode === 'read')) {
      this.standUp();
    }
    if (moving && (this.mode === 'beads' || this.mode === 'fish')) {
      this.endOverlay();
    }

    // one-shot actions
    if (this.busy) {
      const b = this.busy;
      b.t += dt;
      while (b.events.length && b.events[0][0] <= b.t) b.events.shift()![1]();
      if (b.t >= b.until) {
        this.busy = null;
        b.done();
        if (this.mode === 'free') this.player.monk.setAct('idle');
      }
    }
    if (this.mode === 'repeatBow') {
      const m = this.player.monk;
      if (m.act === 'bow' && m.actT >= ACT_DURATION.bow!) {
        this.bowCount++;
        this.countBow();
        this.ev.repeatBow(this.bowCount);
        m.setAct('idle');
        m.setAct('bow');
      }
    }
    if (this.mode === 'sit') {
      this.sitT += dt;
      if (this.sitT >= 60) {
        this.sitT = 0;
        sound.chime(0.6);
        store.update(() => {}, 2);
        this.ev.toast(`+2 ${t('xp')}`);
      }
    }

    this.player.update(dt, this.input.move, this.rig.yaw, this.mode === 'carry');
    if (this.mode === 'free') this.player.monk.setAct(this.player.speed > 0.3 ? 'walk' : 'idle');
    if (this.mode === 'carry') this.player.monk.setAct('carry');
    this.player.monk.update(dt, this.player.speed / 3);

    if (this.player.blockedArea) {
      this.lockedToastT -= dt;
      if (this.lockedToastT <= 0) {
        const rank = RANKS[UNLOCKS.area.indexOf(this.player.blockedArea)];
        this.ev.toast({ key: 'lockedArea', vars: { rank: getLang() === 'zh' ? rank.zh : rank.en } });
        this.lockedToastT = 4;
      }
    }

    // nearest available interaction
    let best: Interaction | null = null;
    let bestD = Infinity;
    if (this.mode === 'free' || this.mode === 'carry') {
      for (const it of this.interactions()) {
        const d = Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z);
        if (d < it.r && Math.abs(it.y - this.player.pos.y) < 1.6 && d < bestD) {
          best = it;
          bestD = d;
        }
      }
    }
    this.interaction = best;
    this.ev.context(this.mode === 'repeatBow' || this.mode === 'sit' ? 'i_stop' : best?.key ?? null);
    if (this.input.interactPressed) {
      this.input.interactPressed = false;
      this.interact();
    }
    this.bellCooldown -= dt;

    // chanting
    const cs = chantState();
    if (cs.active) {
      if (cs.beat !== this.lastChantBeat) {
        this.lastChantBeat = cs.beat;
        if (cs.syllable >= 0) {
          sound.chantSyllable(PHRASES[cs.phrase].vowels[cs.syllable], SYLLABLE_SECONDS);
          sound.woodfish(0, 'chant', 0.55);
          if (cs.syllable === 0) sound.chime(0.5);
        } else sound.chantRest();
      }
      const d = Math.hypot(this.player.pos.x, this.player.pos.z + 13);
      sound.setChantProximity(THREE.MathUtils.clamp(1 - (d - 10) / 60, 0.35, 1));
    } else if (this.chantWasActive) {
      sound.chantStop();
    }
    if (cs.active !== this.chantWasActive || cs.active) this.ev.chant(cs);
    this.chantWasActive = cs.active;

    for (const r of this.residents) if (r.monk.root.visible) r.update(dt, cs.active);
    for (const r of this.remotes.values()) r.update(dt);

    this.rig.update(dt, this.player.pos, look);
    // keep the shadow camera around the player
    this.sun.position.set(this.player.pos.x + 30, this.player.pos.y + 45, this.player.pos.z + 40);
    this.sun.target.position.copy(this.player.pos);

    this.temple.update(dt);
    this.bamboo.update(this.time);
    this.mist.update(dt);
    const nearBell = Math.hypot(this.player.pos.x - SPOTS.bell.x, this.player.pos.z - SPOTS.bell.z) < 15;
    sound.update(dt, { nearBell });

    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera);
  }
}
