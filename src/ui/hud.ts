// All on-screen UI: status card, action buttons, toasts, chanting banner, the bead
// and wooden-fish overlays, and the panels (daily, monk, sound, account, sutra).
import { CHANNELS, sound, type Channel } from '../audio/audio.ts';
import { chantState, PHRASES, previewChant, type ChantState } from '../chant.ts';
import { getLang, item, setLang, t, type Key } from '../i18n.ts';
import { net } from '../net.ts';
import { isUnlocked, PRACTICES, rankIndex, rankProgress, RANKS, UNLOCKS, type Slot } from '../state/progress.ts';
import { store } from '../state/store.ts';
import { beijingDate, nextBeijingMidnight, now } from '../state/time.ts';
import { BEAD_COLORS, ROBES } from '../world/monk.ts';
import type { Game } from '../game.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ICONS = {
  daily: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/></svg>',
  monk: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5 21c.5-5 3.4-8 7-8s6.5 3 7 8z"/><path d="M9.5 13.5L12 17l2.5-3.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="14" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="16" r="2"/></svg>',
  on: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
  off: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  account: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
};

type Panel = 'daily' | 'monk' | 'sound' | 'account' | 'sutra' | null;

export class Hud {
  private panel: Panel = null;
  private toastBox = $('#toasts');
  private sheet = $('#sheet');
  private ctxKey: Key | null = null;
  private overlay: 'beads' | 'fish' | null = null;
  private accountMsg = '';
  private accountLink = '';

  constructor(private game: Game) {
    this.buildHud();
    this.buildOverlays();
    this.render();
    store.on((e) => {
      if (e.type === 'change') this.render();
      if (e.type === 'practice' && e.result.completed) {
        const name = t(`p_${e.id}` as Key);
        this.toast(t('practiceDone', { name, xp: PRACTICES.find((p) => p.id === e.id)!.xp }), 'good');
        sound.chime(1.2);
        if (e.result.allDone) setTimeout(() => { this.toast(t('allDone'), 'good'); sound.bowl(); }, 900);
      }
      if (e.type === 'rankUp') this.rankUp(e.rank);
    });
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input')) return;
      if (e.code === 'Space' && this.overlay) {
        e.preventDefault();
        if (this.overlay === 'beads') this.game.bead();
        else this.strike();
      }
      if (e.code === 'Escape') {
        this.closeOverlay();
        this.closePanel();
      }
    });
    setInterval(() => { if (this.panel === 'daily') this.renderPanel(); }, 30000);
  }

  // ---------- HUD ----------
  private buildHud() {
    const hud = $('#hud');
    hud.innerHTML = `
      <button class="me" id="me" aria-label="character"></button>
      <div class="tr">
        <button class="ib" data-panel="daily" aria-label="daily">${ICONS.daily}<span class="badge" id="dailyBadge"></span></button>
        <button class="ib" data-panel="monk" aria-label="monk">${ICONS.monk}</button>
        <button class="ib" data-panel="sound" aria-label="sound">${ICONS.sound}</button>
        <button class="ib" id="mute" aria-label="mute"></button>
        <button class="ib lang" id="lang"></button>
        <button class="ib" data-panel="account" aria-label="account">${ICONS.account}</button>
      </div>
      <div class="presence" id="presence"></div>
      <div class="banner" id="banner" hidden></div>
      <div class="actions">
        <button class="ctx" id="ctx" hidden></button>
        <div class="ring">
          <button class="act" data-act="bow"><b>拜</b><span></span></button>
          <button class="act" data-act="palms"><b>十</b><span></span></button>
          <button class="act" data-act="beads"><b>珠</b><span></span></button>
          <button class="act" data-act="fish"><b>鱼</b><span></span></button>
        </div>
      </div>
      <div class="repeat" id="repeat" hidden></div>
      <div class="hint" id="hint"></div>`;
    $('#me').onclick = () => this.openPanel('monk');
    hud.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => (b.onclick = () => this.openPanel(b.dataset.panel as Panel)));
    $('#mute').onclick = () => {
      sound.start();
      sound.setMuted(!sound.muted);
      this.render();
    };
    $('#lang').onclick = () => setLang(getLang() === 'zh' ? 'en' : 'zh');
    $('#ctx').onclick = () => this.game.interact();
    hud.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => (b.onclick = () => this.action(b.dataset.act!)));
  }

  private action(a: string) {
    sound.start();
    if (a === 'bow') this.game.bow();
    if (a === 'palms') this.game.palms();
    if (a === 'beads' && this.game.beginBeads()) this.openOverlay('beads');
    if (a === 'fish' && this.game.beginFish()) this.openOverlay('fish');
  }

  showHint(touch: boolean) {
    const h = $('#hint');
    h.textContent = t(touch ? 'hintMove' : 'hintMoveDesk');
    h.classList.add('on');
    setTimeout(() => h.classList.remove('on'), 9000);
  }

  render() {
    const p = store.progress;
    const r = rankIndex(p.xp);
    const rank = RANKS[r];
    const zh = getLang() === 'zh';
    $('#me').innerHTML = `
      <div class="me-name">${esc(p.name.zh)} <i>${esc(p.name.en)}</i></div>
      <div class="me-rank">${zh ? rank.zh : rank.en} · ${p.xp} ${t('xp')}</div>
      <div class="bar"><div style="width:${(rankProgress(p.xp) * 100).toFixed(1)}%"></div></div>`;
    const left = PRACTICES.length - p.daily.done.length;
    const badge = $('#dailyBadge');
    badge.textContent = left ? String(left) : '';
    badge.hidden = !left;
    $('#mute').innerHTML = sound.muted ? ICONS.off : ICONS.on;
    $('#lang').textContent = zh ? 'EN' : '中';
    document.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => (b.querySelector('span')!.textContent = t(b.dataset.act as Key)));
    this.setContext(this.ctxKey, true);
    if (this.panel) this.renderPanel();
    if (this.overlay) this.renderOverlay();
  }

  setPresence(n: number) {
    const el = $('#presence');
    el.textContent = n > 0 ? t('others', { n: n + 1 }) : '';
    el.hidden = n === 0;
  }

  setContext(key: Key | null, force = false) {
    if (key === this.ctxKey && !force) return;
    this.ctxKey = key;
    const b = $('#ctx');
    b.hidden = !key;
    if (key) b.textContent = t(key);
  }

  setRepeat(n: number | null) {
    const el = $('#repeat');
    el.hidden = n === null;
    if (n !== null) el.textContent = t('repeatBow', { n });
  }

  toast(msg: string, kind: 'info' | 'good' | 'big' = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    this.toastBox.appendChild(el);
    while (this.toastBox.children.length > 3) this.toastBox.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), kind === 'big' ? 4200 : 2600);
    setTimeout(() => el.remove(), kind === 'big' ? 5000 : 3400);
  }

  private rankUp(r: number) {
    sound.bowl();
    const zh = getLang() === 'zh';
    const list = [item('robe', UNLOCKS.robe[r]), item('beads', UNLOCKS.beads[r]), item('accessory', UNLOCKS.accessory[r]), item('area', UNLOCKS.area[r])].join(zh ? '、' : ', ');
    this.toast(t('rankUp', { rank: zh ? RANKS[r].zh : RANKS[r].en }), 'big');
    setTimeout(() => this.toast(t('unlockedNew', { list }), 'good'), 600);
  }

  chant(cs: ChantState) {
    const b = $('#banner');
    if (!cs.active) {
      b.hidden = true;
      return;
    }
    b.hidden = false;
    const ph = PHRASES[cs.phrase];
    const chars = [...ph.zh].map((c, i) => `<span class="${i === cs.syllable ? 'cur' : i < cs.syllable || cs.syllable < 0 ? 'past' : ''}"><b>${c}</b><i>${ph.py[i]}</i></span>`).join('');
    const key = `${cs.phrase}:${cs.syllable}:${getLang()}`;
    if (b.dataset.key === key) return;
    b.dataset.key = key;
    b.innerHTML = `<div class="b-title">${t('chantNow')}</div><div class="b-line">${chars}</div>`;
  }

  // ---------- overlays ----------
  private buildOverlays() {
    const beads = $('#beads');
    let ring = '';
    for (let i = 0; i < 108; i++) {
      const a = (i / 108) * Math.PI * 2 - Math.PI / 2;
      ring += `<circle data-i="${i}" cx="${(150 + Math.cos(a) * 120).toFixed(1)}" cy="${(150 + Math.sin(a) * 120).toFixed(1)}" r="${i % 27 === 0 ? 6.5 : 4.6}"/>`;
    }
    beads.innerHTML = `
      <button class="ov-close" aria-label="close">${ICONS.close}</button>
      <div class="ov-tap">
        <svg viewBox="0 0 300 300" class="bead-ring">${ring}<circle class="guru" cx="150" cy="22" r="9"/></svg>
        <div class="bead-count"><b id="beadN"></b><span id="beadR"></span></div>
      </div>
      <div class="ov-tip" id="beadTip"></div>`;
    beads.querySelector<HTMLElement>('.ov-tap')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.game.bead();
      const el = beads.querySelector('.bead-ring')!;
      el.classList.remove('tick');
      void (el as HTMLElement).getBoundingClientRect();
      el.classList.add('tick');
    });
    beads.querySelector<HTMLElement>('.ov-close')!.onclick = () => this.closeOverlay();

    const fish = $('#fish');
    fish.innerHTML = `
      <button class="ov-close" aria-label="close">${ICONS.close}</button>
      <div class="ov-tap">
        <div class="muyu" id="muyu">
          <svg viewBox="0 0 200 160">
            <defs><radialGradient id="mg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#c0602f"/><stop offset="1" stop-color="#6e2a14"/></radialGradient></defs>
            <ellipse cx="100" cy="92" rx="86" ry="60" fill="url(#mg)"/>
            <path d="M30 100 Q100 128 170 100" stroke="#3a150a" stroke-width="7" fill="none" stroke-linecap="round"/>
            <circle cx="62" cy="72" r="7" fill="#3a150a"/><path d="M128 52 q16 -10 30 4" stroke="#e0a070" stroke-width="3" fill="none" opacity=".5"/>
          </svg>
        </div>
        <div class="merit"><span id="meritLbl"></span> <b id="meritN"></b></div>
      </div>
      <div class="ov-tip" id="fishTip"></div>`;
    fish.querySelector<HTMLElement>('.ov-tap')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.strike(e.clientX, e.clientY);
    });
    fish.querySelector<HTMLElement>('.ov-close')!.onclick = () => this.closeOverlay();
  }

  private strike(x?: number, y?: number) {
    this.game.strikeFish();
    const m = $('#muyu');
    m.classList.remove('hit');
    void m.getBoundingClientRect();
    m.classList.add('hit');
    const f = document.createElement('div');
    f.className = 'float';
    f.textContent = t('meritPlus');
    const r = m.getBoundingClientRect();
    f.style.left = `${x ?? r.left + r.width / 2}px`;
    f.style.top = `${(y ?? r.top) - 20}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  openOverlay(which: 'beads' | 'fish') {
    this.closePanel();
    this.overlay = which;
    $('#beads').hidden = which !== 'beads';
    $('#fish').hidden = which !== 'fish';
    document.body.classList.add('overlay-on');
    this.renderOverlay();
  }

  closeOverlay() {
    if (!this.overlay) return;
    this.overlay = null;
    $('#beads').hidden = $('#fish').hidden = true;
    document.body.classList.remove('overlay-on');
    this.game.endOverlay();
  }

  /** Called by the game when the player walks away. */
  overlayEndedByGame() {
    if (!this.overlay) return;
    this.overlay = null;
    $('#beads').hidden = $('#fish').hidden = true;
    document.body.classList.remove('overlay-on');
  }

  private renderOverlay() {
    const p = store.progress;
    if (this.overlay === 'beads') {
      const color = BEAD_COLORS[p.equip.beads];
      document.querySelectorAll<SVGCircleElement>('#beads circle[data-i]').forEach((c) => {
        const i = Number(c.dataset.i);
        c.style.fill = i < p.bead ? color : 'rgba(255,255,255,.18)';
        c.classList.toggle('cur', i === p.bead);
      });
      $('#beadN').textContent = `${p.bead} / 108`;
      $('#beadR').textContent = `${p.rounds} ${t('round')}`;
      const today = p.daily.counts.beads ?? 0;
      $('#beadTip').textContent = `${t('p_beads')} · ${Math.min(today, 108)}/108`;
    } else if (this.overlay === 'fish') {
      $('#meritLbl').textContent = t('merit');
      $('#meritN').textContent = String(p.merit);
      const today = p.daily.counts.fish ?? 0;
      $('#fishTip').textContent = `${t('p_fish')} · ${Math.min(today, 33)}/33`;
    }
  }

  // ---------- panels ----------
  openPanel(p: Panel) {
    sound.start();
    if (this.panel === p) return this.closePanel();
    this.panel = p;
    this.sheet.hidden = false;
    this.renderPanel();
  }
  closePanel() {
    if (this.panel === 'sutra') this.game.endOverlay();
    this.panel = null;
    this.sheet.hidden = true;
  }

  private renderPanel() {
    const titles: Record<Exclude<Panel, null>, string> = {
      daily: t('daily'), monk: t('character'), sound: t('mixer'), account: t('account'), sutra: t('sutraTitle'),
    };
    if (!this.panel) return;
    const body = this.panel === 'daily' ? this.dailyHtml() : this.panel === 'monk' ? this.monkHtml() : this.panel === 'sound' ? this.soundHtml() : this.panel === 'account' ? this.accountHtml() : this.sutraHtml();
    const keepScroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    this.sheet.innerHTML = `
      <div class="sheet-card">
        <header><h2>${titles[this.panel]}</h2><button class="ib" id="sheetClose" aria-label="close">${ICONS.close}</button></header>
        <div class="sheet-body">${body}</div>
      </div>`;
    this.sheet.querySelector('.sheet-body')!.scrollTop = keepScroll;
    $('#sheetClose').onclick = () => this.closePanel();
    this.sheet.onclick = (e) => { if (e.target === this.sheet) this.closePanel(); };
    this.bindPanel();
  }

  private dailyHtml(): string {
    const p = store.progress;
    const rows = PRACTICES.map((d) => {
      const c = Math.min(p.daily.counts[d.id] ?? 0, d.target);
      const done = p.daily.done.includes(d.id);
      return `<li class="${done ? 'done' : ''}">
        <span class="chk">${done ? ICONS.check : ''}</span>
        <div><b>${t(`p_${d.id}` as Key)}</b><small>${t(`pd_${d.id}` as Key)}</small>
          <div class="bar thin"><div style="width:${(c / d.target) * 100}%"></div></div></div>
        <span class="num">${c}/${d.target}<em>+${d.xp}</em></span></li>`;
    }).join('');
    const ms = nextBeijingMidnight() - now();
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
    const cs = chantState();
    const next = new Date(cs.nextStart + 8 * 3600e3);
    const hhmm = `${String(next.getUTCHours()).padStart(2, '0')}:${String(next.getUTCMinutes()).padStart(2, '0')}`;
    return `
      <div class="streak"><b>${p.streak.count}</b> ${t('days')} <span>${t('streak')} · ${t('bestStreak')} ${p.streak.best}</span></div>
      <ul class="daily">${rows}</ul>
      <p class="muted">${p.daily.done.length === PRACTICES.length ? t('allDone') + ' · ' : ''}${t('resetIn', { h, m })} · ${beijingDate()}</p>
      <p class="muted">${cs.active ? t('chantNow') : t('chantNext', { time: hhmm })} · ${t('chantJoin')}</p>`;
  }

  private monkHtml(): string {
    const p = store.progress;
    const r = rankIndex(p.xp);
    const zh = getLang() === 'zh';
    const next = RANKS[r + 1];
    const slot = (s: Slot, label: Key, swatch: (v: string) => string) => `
      <h3>${t(label)}</h3><div class="grid">${UNLOCKS[s].map((v, i) => {
        const ok = isUnlocked(p.xp, s, v);
        const on = p.equip[s] === v;
        return `<button class="it ${on ? 'on' : ''}" data-slot="${s}" data-v="${v}" ${ok ? '' : 'disabled'}>
          ${swatch(v)}<span>${item(s, v)}</span>${ok ? '' : `<small>${ICONS.lock}${zh ? RANKS[i].zh : RANKS[i].en}</small>`}</button>`;
      }).join('')}</div>`;
    const accGlyph: Record<string, string> = { none: '·', hat: '笠', satchel: '包', staff: '杖', lantern: '灯', whisk: '拂' };
    return `
      <div class="who"><div class="who-name">${esc(p.name.zh)} <i>${esc(p.name.en)}</i></div>
        <div class="who-rank">${RANKS.map((rk, i) => `<span class="${i <= r ? 'got' : ''} ${i === r ? 'cur' : ''}">${zh ? rk.zh : rk.en}</span>`).join('')}</div>
        <div class="bar"><div style="width:${rankProgress(p.xp) * 100}%"></div></div>
        <p class="muted">${p.xp} ${t('xp')} · ${next ? t('nextRank', { rank: zh ? next.zh : next.en, xp: next.xp - p.xp }) : t('maxRank')}</p></div>
      <div class="stats">
        <div><b>${p.merit}</b><span>${t('merit')}</span></div>
        <div><b>${p.bows}</b><span>${t('lifetimeBows')}</span></div>
        <div><b>${p.rounds}</b><span>${t('rounds')}</span></div>
        <div><b>${p.streak.count}</b><span>${t('streak')}</span></div>
      </div>
      ${slot('robe', 'robe', (v) => `<i class="sw" style="background:${ROBES[v].main};box-shadow:inset 0 -6px 0 ${ROBES[v].sash ?? ROBES[v].trim}"></i>`)}
      ${slot('beads', 'beadStyle', (v) => `<i class="sw bead" style="background:${BEAD_COLORS[v]}"></i>`)}
      ${slot('accessory', 'accessory', (v) => `<i class="sw glyph">${accGlyph[v]}</i>`)}
      <h3>${t('areas')}</h3>
      <ul class="areas">${UNLOCKS.area.map((a, i) => `<li class="${i <= r ? 'got' : ''}">${i <= r ? ICONS.check : ICONS.lock}<span>${item('area', a)}</span><small>${i <= r ? '' : t('lockedAt', { rank: zh ? RANKS[i].zh : RANKS[i].en })}</small></li>`).join('')}</ul>`;
  }

  private soundHtml(): string {
    const labels: Record<Channel, Key> = { master: 'master', wind: 'wind', birds: 'birds', bells: 'bells', chant: 'chant', sfx: 'sfx' };
    return `
      <label class="toggle"><input type="checkbox" id="muteBox" ${sound.muted ? 'checked' : ''}> ${t('mute')}</label>
      ${CHANNELS.map((c) => `<label class="slider"><span>${t(labels[c])}</span><input type="range" min="0" max="1" step="0.01" value="${sound.levels[c]}" data-ch="${c}"></label>`).join('')}
      <button class="btn" id="previewChant">${t('chant')} ▶</button>
      <p class="muted">${t('chantJoin')}</p>`;
  }

  private accountHtml(): string {
    const logged = !!net.session;
    return `
      ${logged
        ? `<p>${t('loggedInAs', { email: esc(net.email ?? '') })}</p>
           <p class="muted">${net.lastSync ? t('synced') + ' · ' + new Date(net.lastSync).toLocaleTimeString() : ''}</p>
           <button class="btn ghost" id="logout">${t('logout')}</button>`
        : `<p><b>${t('guest')}</b></p><p class="muted">${t('guestNote')}</p>
           <form id="loginForm" class="login">
             <input type="email" id="email" placeholder="${t('email')}" autocomplete="email" required>
             <button class="btn" type="submit">${t('sendLink')}</button>
           </form>`}
      ${this.accountMsg ? `<p class="note">${esc(this.accountMsg)}${this.accountLink ? `<br><a href="${esc(this.accountLink)}">${esc(this.accountLink)}</a>` : ''}</p>` : ''}
      <h3>${t('about')}</h3><p class="muted">${t('aboutText')}</p>`;
  }

  private sutraHtml(): string {
    const lines = [
      ['观自在菩萨，行深般若波罗蜜多时，照见五蕴皆空，度一切苦厄。', 'Avalokiteshvara, practising deeply the perfection of wisdom, saw that all five aggregates are empty, and passed beyond all suffering.'],
      ['舍利子，色不异空，空不异色，色即是空，空即是色。', 'Shariputra, form is not other than emptiness, emptiness not other than form. Form is emptiness; emptiness is form.'],
      ['受想行识，亦复如是。', 'So too are feeling, perception, formation and consciousness.'],
      ['心无挂碍，无挂碍故，无有恐怖。', 'With no hindrance in the mind, there is no fear.'],
    ];
    return `<div class="sutra">${lines.map(([zh, en]) => `<p><b>${zh}</b><span>${en}</span></p>`).join('')}</div>`;
  }

  openSutra() {
    this.openPanel('sutra');
  }

  private bindPanel() {
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => {
      b.onclick = () => {
        if (store.equip(b.dataset.slot as Slot, b.dataset.v!)) sound.chime(1.5);
      };
    });
    this.sheet.querySelectorAll<HTMLInputElement>('[data-ch]').forEach((inp) => {
      inp.oninput = () => {
        sound.start();
        sound.setLevel(inp.dataset.ch as Channel, Number(inp.value));
      };
    });
    const mb = this.sheet.querySelector<HTMLInputElement>('#muteBox');
    if (mb) mb.onchange = () => { sound.setMuted(mb.checked); this.render(); };
    const pc = this.sheet.querySelector<HTMLButtonElement>('#previewChant');
    if (pc) pc.onclick = () => { sound.start(); previewChant(40); };
    const form = this.sheet.querySelector<HTMLFormElement>('#loginForm');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const email = (form.querySelector('#email') as HTMLInputElement).value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          this.accountMsg = t('badEmail');
          return this.renderPanel();
        }
        const btn = form.querySelector('button')!;
        btn.disabled = true;
        const r = await net.requestLink(email, getLang());
        this.accountLink = '';
        if (r.status === 'sent') this.accountMsg = t('linkSent');
        else if (r.status === 'dev') { this.accountMsg = t('devLink'); this.accountLink = r.link!; }
        else this.accountMsg = r.error === 'too_fast' ? t('tooFast') : r.error === 'email_not_configured' ? t('emailNotConfigured') : r.error === 'bad_email' ? t('badEmail') : t('serverOff');
        this.renderPanel();
      };
    }
    const lo = this.sheet.querySelector<HTMLButtonElement>('#logout');
    if (lo) lo.onclick = () => { net.logout(); this.accountMsg = ''; this.renderPanel(); };
  }
}
