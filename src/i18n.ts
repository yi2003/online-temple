import { safeGet, safeSet } from './state/store.ts';

export type Lang = 'zh' | 'en';

const dict = {
  title: ['云栖寺', 'Cloud Rest Temple'],
  tapToEnter: ['轻触入寺', 'Tap to enter'],
  subtitle: ['山中一寺，云起松间', 'A small temple among pines and clouds'],
  loading: ['山门渐开…', 'Opening the gate…'],
  bow: ['礼拜', 'Bow'],
  palms: ['合十', 'Palms'],
  beads: ['念珠', 'Beads'],
  fish: ['木鱼', 'Muyu'],
  daily: ['日课', 'Daily'],
  character: ['僧袍', 'Monk'],
  account: ['账户', 'Account'],
  mixer: ['声音', 'Sound'],
  close: ['合上', 'Close'],
  merit: ['功德', 'Merit'],
  round: ['轮', 'rounds'],
  meritPlus: ['功德 +1', 'merit +1'],
  // practices
  p_sweep: ['扫地', 'Sweep'],
  p_water: ['挑水', 'Carry water'],
  p_fish: ['敲木鱼', 'Strike the muyu'],
  p_beads: ['念珠一百零八', '108 prayer beads'],
  p_bow: ['礼拜三次', 'Bow three times'],
  p_incense: ['上香', 'Offer incense'],
  pd_sweep: ['扫净院中落叶', 'Sweep the fallen pine needles'],
  pd_water: ['从山泉挑水入缸', 'Carry spring water to the vat'],
  pd_fish: ['敲木鱼', 'Strike the wooden fish'],
  pd_beads: ['拨完一圈念珠', 'Count one full round of beads'],
  pd_bow: ['在佛前或任意处礼拜', 'Bow anywhere, or before the Buddha'],
  pd_incense: ['在香炉前上一炷香', 'Offer a stick at the incense burner'],
  // interactions
  i_sweep: ['扫落叶', 'Sweep'],
  i_well: ['打水', 'Draw water'],
  i_vat: ['倒水入缸', 'Pour water'],
  i_incense: ['上香', 'Offer incense'],
  i_cushion: ['蒲团礼拜', 'Bow on cushion'],
  i_bell: ['撞钟', 'Ring the bell'],
  i_sutra: ['读经', 'Read sutra'],
  i_sit: ['静坐', 'Sit quietly'],
  i_stop: ['起身', 'Stand up'],
  carrying: ['挑着水 · 送到大殿旁的水缸', 'Carrying water · take it to the vat by the hall'],
  lockedArea: ['修至「{rank}」方可入内', 'Reach {rank} to enter'],
  // feedback
  done: ['完成', 'Done'],
  practiceDone: ['日课完成：{name}  +{xp} 修为', 'Practice done: {name}  +{xp} XP'],
  allDone: ['今日日课圆满', "Today's practice is complete"],
  rankUp: ['晋升「{rank}」', 'You are now {rank}'],
  unlockedNew: ['新解锁：{list}', 'Unlocked: {list}'],
  repeatBow: ['蒲团礼拜中 · {n} 拜', 'Bowing on the cushion · {n}'],
  greetBack: ['{name} 合十回礼', '{name} returns your greeting'],
  // character
  xp: ['修为', 'Cultivation'],
  streak: ['连续修行', 'Practice streak'],
  bestStreak: ['最长', 'Best'],
  days: ['天', 'days'],
  lifetimeBows: ['礼拜', 'Bows'],
  rounds: ['念珠圈数', 'Bead rounds'],
  robe: ['僧袍', 'Robe'],
  beadStyle: ['念珠', 'Beads'],
  accessory: ['随身', 'Accessory'],
  areas: ['可去之处', 'Places'],
  lockedAt: ['{rank} 解锁', 'Unlocks at {rank}'],
  nextRank: ['距「{rank}」还差 {xp} 修为', '{xp} XP to {rank}'],
  maxRank: ['已至禅师', 'Highest rank reached'],
  resetIn: ['{h} 小时 {m} 分后重置（北京时间）', 'Resets in {h}h {m}m (Beijing time)'],
  // items
  robe_grey: ['灰布', 'Grey cotton'], robe_ochre: ['赭石', 'Ochre'], robe_indigo: ['靛青', 'Indigo'],
  robe_apricot: ['杏黄', 'Apricot'], robe_crimson: ['绛红', 'Crimson'], robe_golden: ['金襕', 'Gold-trimmed'],
  beads_wood: ['木珠', 'Wood'], beads_bodhi: ['菩提', 'Bodhi seed'], beads_sandal: ['檀香', 'Sandalwood'],
  beads_jade: ['青玉', 'Jade'], beads_crystal: ['水晶', 'Crystal'], beads_amber: ['琥珀', 'Amber'],
  accessory_none: ['无', 'None'], accessory_hat: ['斗笠', 'Bamboo hat'], accessory_satchel: ['布包', 'Satchel'],
  accessory_staff: ['锡杖', "Monk's staff"], accessory_lantern: ['莲灯', 'Lotus lantern'], accessory_whisk: ['拂尘', 'Whisk'],
  area_courtyard: ['庭院与大殿', 'Courtyard & hall'], area_bell: ['钟楼', 'Bell tower'], area_pond: ['莲池', 'Lotus pond'],
  area_bamboo: ['竹林', 'Bamboo grove'], area_sutra: ['藏经阁', 'Sutra pavilion'], area_summit: ['云顶', 'Cloud summit'],
  // account
  guest: ['游客', 'Guest'],
  guestNote: ['进度保存在本机。登录后可在多台设备同步，本机进度会一并带入。', 'Progress is saved on this device. Log in to sync across devices — your guest progress comes with you.'],
  email: ['邮箱', 'Email'],
  sendLink: ['发送登录链接', 'Send login link'],
  linkSent: ['登录链接已发送，请查收邮件。', 'Check your email for the login link.'],
  devLink: ['邮件服务尚未配置，测试链接：', 'Email is not configured yet. Test link:'],
  emailNotConfigured: ['邮件服务尚未配置，暂时无法登录。', 'Email delivery is not set up yet, so login is unavailable for now.'],
  serverOff: ['同步服务暂不可用，仍以游客身份修行。', 'Sync is unavailable; continuing as a guest.'],
  loggedInAs: ['已登录：{email}', 'Logged in as {email}'],
  synced: ['已同步', 'Synced'],
  logout: ['退出登录', 'Log out'],
  loginOk: ['登录成功，进度已合并', 'Logged in — progress merged'],
  loginFail: ['登录链接无效或已过期', 'That login link is invalid or expired'],
  tooFast: ['请稍候一分钟再试', 'Please wait a minute and try again'],
  badEmail: ['邮箱格式不对', "That email doesn't look right"],
  about: ['关于', 'About'],
  aboutText: [
    '云栖寺是一个原创的安静小寺。建筑、人物、声音皆以代码生成，未使用任何第三方素材。灵感来自在线寺庙《山寺 Sansa》，与之无关联。无战斗、无排行、无付费。',
    'Cloud Rest Temple is an original, quiet place. Every building, character and sound is generated in code; no third-party assets are used. Inspired by the online temple Sansa, with no affiliation. No combat, no leaderboard, nothing to buy.',
  ],
  // sound
  master: ['总音量', 'Master'],
  wind: ['山风', 'Wind'],
  birds: ['鸟鸣', 'Birds'],
  bells: ['钟声', 'Bells'],
  chant: ['诵经', 'Chanting'],
  sfx: ['动作', 'Actions'],
  mute: ['静音', 'Mute'],
  // chanting
  chantNow: ['共修中 · 众僧同诵', 'Group chanting · everyone hears this together'],
  chantNext: ['下次共修 {time}（北京时间）', 'Next group chanting {time} Beijing time'],
  chantJoin: ['到大殿蒲团上随众诵经', 'Join on a cushion in the hall'],
  others: ['山中 {n} 位', '{n} in the mountains'],
  // hints
  hintMove: ['左侧拖动行走 · 右侧拖动转视角', 'Drag left to walk · drag right to look'],
  hintMoveDesk: ['WASD 行走 · 拖动鼠标转视角 · 滚轮缩放 · E 互动', 'WASD to walk · drag to look · scroll to zoom · E to interact'],
  sutraTitle: ['般若波罗蜜多心经（节选）', 'Heart Sutra (excerpt)'],
} satisfies Record<string, [string, string]>;

export type Key = keyof typeof dict;

let lang: Lang = (safeGet('temple.lang') as Lang) || (navigator.language.startsWith('zh') ? 'zh' : 'en');
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang) {
  lang = l;
  safeSet('temple.lang', l);
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  for (const fn of listeners) fn();
}
export function onLang(fn: () => void) {
  listeners.add(fn);
}
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const s = dict[key][lang === 'zh' ? 0 : 1];
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
/** Localised name of an item / area, e.g. item('robe', 'ochre'). */
export function item(kind: string, value: string): string {
  return t(`${kind}_${value}` as Key);
}
