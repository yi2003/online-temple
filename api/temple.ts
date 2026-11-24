// Single serverless function for Online Temple (keeps within free-tier function limits).
// Routes: /api/:op is rewritten to /api/temple?op=:op by vercel.json.
//   GET  time          server clock + whether storage is configured
//   POST request-link  { email, lang }          -> emails a magic link
//   POST verify        { token }                -> { session, email }
//   POST logout        { session }
//   POST load          { session }              -> { progress, rev }
//   POST save          { session, rev, progress } (409 if rev is stale)
//   POST presence      { id, n, x, z, ry, act, robe, rank } -> { players }
// Storage is Upstash Redis over REST. Self-contained on purpose (no local imports).

const env = (k: string): string => (typeof process !== 'undefined' ? process.env[k] ?? '' : '');

// ---------- storage ----------
interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number, nx?: boolean): Promise<boolean>;
  del(key: string): Promise<void>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, fields: string[]): Promise<void>;
  /** Atomically replace {rev,data} at key only if the stored rev matches. */
  cas(key: string, rev: number, data: string): Promise<{ ok: boolean; rev: number }>;
}

class Upstash implements Storage {
  constructor(private url: string, private token: string) {}
  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) throw new Error(json.error);
    return json.result as T;
  }
  async get(key: string) {
    return this.cmd<string | null>('GET', key);
  }
  async set(key: string, value: string, ttlSec?: number, nx = false) {
    const args: (string | number)[] = ['SET', key, value];
    if (ttlSec) args.push('EX', ttlSec);
    if (nx) args.push('NX');
    return (await this.cmd<string | null>(...args)) === 'OK';
  }
  async del(key: string) {
    await this.cmd('DEL', key);
  }
  async hset(key: string, field: string, value: string) {
    await this.cmd('HSET', key, field, value);
  }
  async hgetall(key: string) {
    const flat = (await this.cmd<string[]>('HGETALL', key)) ?? [];
    const out: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  }
  async hdel(key: string, fields: string[]) {
    if (fields.length) await this.cmd('HDEL', key, ...fields);
  }
  async cas(key: string, rev: number, data: string) {
    const script = `
      local r = redis.call('HGET', KEYS[1], 'rev') or '0'
      if r ~= ARGV[1] then return {0, r} end
      local n = tostring(tonumber(ARGV[1]) + 1)
      redis.call('HSET', KEYS[1], 'rev', n, 'data', ARGV[2])
      return {1, n}`;
    const [ok, r] = await this.cmd<[number, string]>('EVAL', script, 1, key, rev, data);
    return { ok: ok === 1, rev: Number(r) };
  }
}

/** In-memory stand-in for local development only (never used on Vercel). */
class Memory implements Storage {
  private kv = new Map<string, { v: string; exp: number }>();
  private h = new Map<string, Map<string, string>>();
  private live(key: string) {
    const e = this.kv.get(key);
    if (e && e.exp && e.exp < Date.now()) this.kv.delete(key);
    return this.kv.get(key);
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSec?: number, nx = false) {
    if (nx && this.live(key)) return false;
    this.kv.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
    return true;
  }
  async del(key: string) {
    this.kv.delete(key);
  }
  async hset(key: string, field: string, value: string) {
    if (!this.h.has(key)) this.h.set(key, new Map());
    this.h.get(key)!.set(field, value);
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.h.get(key) ?? []);
  }
  async hdel(key: string, fields: string[]) {
    for (const f of fields) this.h.get(key)?.delete(f);
  }
  async cas(key: string, rev: number, data: string) {
    const cur = Number(this.h.get(key)?.get('rev') ?? 0);
    if (cur !== rev) return { ok: false, rev: cur };
    await this.hset(key, 'rev', String(rev + 1));
    await this.hset(key, 'data', data);
    return { ok: true, rev: rev + 1 };
  }
}

let memory: Memory | null = null;
function storage(): Storage | null {
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  if (url && token) return new Upstash(url, token);
  if (!env('VERCEL')) return (memory ??= new Memory());
  return null;
}

// ---------- helpers ----------
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const ACTS = new Set(['idle', 'walk', 'bow', 'palms', 'greet', 'fish', 'beads', 'sweep', 'carry', 'incense', 'sit', 'draw', 'pour', 'ring', 'read']);
const ROBES = new Set(['grey', 'ochre', 'indigo', 'apricot', 'crimson', 'golden']);
const NAME_FIRST = 18, NAME_SECOND = 18; // sizes of the name tables in src/state/names.ts
const PRESENCE_KEY = 'presence';
const PRESENCE_TTL = 15000;
const SESSION_TTL = 60 * 24 * 3600;

async function emailFor(db: Storage, session: unknown): Promise<string | null> {
  if (typeof session !== 'string' || session.length > 100) return null;
  return db.get(`session:${await sha(session)}`);
}

async function sendMagicLink(to: string, link: string, lang: string): Promise<boolean> {
  const key = env('RESEND_API_KEY');
  if (!key) return false;
  const zh = lang === 'zh';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM') || 'Online Temple <onboarding@resend.dev>',
      to: [to],
      subject: zh ? '云栖寺 · 登录链接' : 'Cloud Rest Temple · your login link',
      html: `<div style="font-family:serif;font-size:16px;line-height:1.7;color:#333">
        <p>${zh ? '轻触下方链接即可登录（15 分钟内有效）：' : 'Tap the link below to log in (valid for 15 minutes):'}</p>
        <p><a href="${link}" style="color:#9a2d22">${zh ? '进入云栖寺' : 'Enter the temple'}</a></p>
        <p style="color:#888;font-size:13px">${zh ? '如果不是你本人操作，忽略此邮件即可。' : "If you didn't ask for this, you can ignore this email."}</p></div>`,
    }),
  });
  return res.ok;
}

// ---------- routes ----------
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') ?? url.pathname.split('/').pop() ?? '';
  const db = storage();

  if (op === 'time') return json({ now: Date.now(), storage: !!db });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!db) return json({ error: 'storage_not_configured' }, 503);

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 40000) return json({ error: 'too_large' }, 413);
    body = JSON.parse(text || '{}');
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  switch (op) {
    case 'request-link': {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return json({ error: 'bad_email' }, 400);
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
      if (!(await db.set(`rl:mail:${await sha(email)}`, '1', 60, true))) return json({ error: 'too_fast' }, 429);
      if (!(await db.set(`rl:ip:${await sha(ip)}`, '1', 10, true))) return json({ error: 'too_fast' }, 429);
      const token = randomToken();
      await db.set(`login:${await sha(token)}`, email, 15 * 60);
      const base = env('APP_BASE_URL') || url.origin;
      const link = `${base}/?login=${token}`;
      const lang = body.lang === 'zh' ? 'zh' : 'en';
      if (await sendMagicLink(email, link, lang)) return json({ sent: true });
      if (env('DEV_MAGIC_LINK') === '1' || !env('VERCEL')) return json({ devLink: link });
      return json({ error: 'email_not_configured' }, 503);
    }
    case 'verify': {
      const token = String(body.token ?? '');
      if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: 'bad_token' }, 400);
      const key = `login:${await sha(token)}`;
      const email = await db.get(key);
      if (!email) return json({ error: 'expired' }, 401);
      await db.del(key);
      const session = randomToken(32);
      await db.set(`session:${await sha(session)}`, email, SESSION_TTL);
      return json({ session, email });
    }
    case 'logout': {
      if (typeof body.session === 'string') await db.del(`session:${await sha(body.session)}`);
      return json({ ok: true });
    }
    case 'load': {
      const email = await emailFor(db, body.session);
      if (!email) return json({ error: 'unauthorized' }, 401);
      const all = await db.hgetall(`progress:${await sha(email)}`);
      return json({ progress: all.data ? JSON.parse(all.data) : null, rev: Number(all.rev ?? 0) });
    }
    case 'save': {
      const email = await emailFor(db, body.session);
      if (!email) return json({ error: 'unauthorized' }, 401);
      const p = body.progress;
      if (!p || typeof p !== 'object' || (p as { v?: unknown }).v !== 1) return json({ error: 'bad_progress' }, 400);
      const r = await db.cas(`progress:${await sha(email)}`, Number(body.rev) || 0, JSON.stringify(p));
      return r.ok ? json({ rev: r.rev }) : json({ error: 'conflict', rev: r.rev }, 409);
    }
    case 'presence': {
      const id = String(body.id ?? '');
      const n = body.n as unknown;
      const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
      if (!/^[\w-]{3,40}$/.test(id) || !Array.isArray(n) || n.length !== 2) return json({ error: 'bad_presence' }, 400);
      const [a, b] = n.map((v) => Math.floor(Number(v)));
      if (!(a >= 0 && a < NAME_FIRST && b >= 0 && b < NAME_SECOND)) return json({ error: 'bad_name' }, 400);
      const now = Date.now();
      const me = {
        id, n: [a, b],
        x: num(body.x, -200, 200), z: num(body.z, -200, 200), ry: num(body.ry, -100, 100),
        act: ACTS.has(String(body.act)) ? String(body.act) : 'idle',
        robe: ROBES.has(String(body.robe)) ? String(body.robe) : 'grey',
        t: now,
      };
      await db.hset(PRESENCE_KEY, id, JSON.stringify(me));
      const all = await db.hgetall(PRESENCE_KEY);
      const players: unknown[] = [];
      const stale: string[] = [];
      for (const [k, v] of Object.entries(all)) {
        try {
          const p = JSON.parse(v) as { t: number };
          if (now - p.t > 60000) stale.push(k);
          else if (k !== id && now - p.t < PRESENCE_TTL) players.push(p);
        } catch {
          stale.push(k);
        }
      }
      if (stale.length) await db.hdel(PRESENCE_KEY, stale);
      return json({ now, players: players.slice(0, 30) });
    }
  }
  return json({ error: 'not_found' }, 404);
}

async function safe(request: Request): Promise<Response> {
  try {
    return await handle(request);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
}

// Vercel Functions, Web-standard signature
export const GET = safe;
export const POST = safe;
