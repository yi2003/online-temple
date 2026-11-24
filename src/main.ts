import './styles.css';
import { sound } from './audio/audio.ts';
import { Game, type RemoteState } from './game.ts';
import { getLang, onLang, setLang, t } from './i18n.ts';
import { net } from './net.ts';
import { store } from './state/store.ts';
import { Hud } from './ui/hud.ts';

const $ = (id: string) => document.getElementById(id)!;

function renderSplash() {
  $('splashTitle').textContent = t('title');
  $('splashSub').textContent = t('subtitle');
  const enter = $('enter') as HTMLButtonElement;
  enter.textContent = enter.disabled ? t('loading') : t('tapToEnter');
  $('splashLang').textContent = getLang() === 'zh' ? 'English' : '中文';
  document.title = `${t('title')} · ${getLang() === 'zh' ? 'Online Temple' : '在线寺庙'}`;
}
setLang(getLang());
renderSplash();
$('splashLang').onclick = () => setLang(getLang() === 'zh' ? 'en' : 'zh');

// Let the splash paint before the (synchronous) scene build.
requestAnimationFrame(() => setTimeout(boot, 30));

function boot() {
  let hud: Hud;
  const game = new Game($('scene') as HTMLCanvasElement, {
    toast: (m) => hud.toast(typeof m === 'string' ? m : t(m.key, m.vars)),
    context: (k) => hud.setContext(k),
    modeChanged: (m) => {
      if (m !== 'beads' && m !== 'fish') hud.overlayEndedByGame();
      if (m !== 'repeatBow') hud.setRepeat(null);
    },
    chant: (cs) => hud.chant(cs),
    repeatBow: (n) => hud.setRepeat(n),
    openSutra: () => hud.openSutra(),
  });
  hud = new Hud(game);
  onLang(() => {
    renderSplash();
    hud.render();
  });
  game.start();
  if (import.meta.env.DEV) Object.assign(window, { game, store });

  const enter = $('enter') as HTMLButtonElement;
  enter.disabled = false;
  renderSplash();
  enter.onclick = () => {
    sound.start();
    $('splash').classList.add('gone');
    setTimeout(() => $('splash').remove(), 1300);
    hud.showHint(game.input.touchUsed || matchMedia('(pointer: coarse)').matches);
  };
  // any first gesture unlocks audio
  const unlock = () => sound.start();
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });

  // the Beijing day can roll over while playing
  setInterval(() => store.tick(), 30000);

  void startNetwork(game, hud);
}

async function startNetwork(game: Game, hud: Hud) {
  await net.init();
  const params = new URLSearchParams(location.search);
  const token = params.get('login');
  if (token) {
    params.delete('login');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
    hud.toast((await net.verify(token)) ? t('loginOk') : t('loginFail'), 'good');
  } else if (net.session) {
    await net.sync();
  }

  // push progress a few seconds after it changes
  let timer = 0;
  store.on((e) => {
    if (e.type !== 'change' || !net.session) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (JSON.stringify(store.progress) !== net.lastJson) void net.sync();
    }, 5000);
  });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && net.session && JSON.stringify(store.progress) !== net.lastJson) void net.sync();
  });

  // presence: see other real players
  const tickPresence = async () => {
    if (document.visibilityState === 'visible' && net.online) {
      const players = await net.presence(game.presenceState());
      if (players) {
        game.applyRemotes(players as RemoteState[]);
        hud.setPresence(game.othersCount);
      }
    }
    setTimeout(tickPresence, 4000);
  };
  void tickPresence();
}
