# 云栖寺 · Online Temple

A quiet, original 3D mountain temple in the browser. You are a little novice monk (小和尚): walk the courtyard, sweep, carry water, strike the wooden fish, count 108 beads, bow and offer incense, and slowly grow through six ranks. There's no combat, no chat, no leaderboard and nothing to buy.

Built with Vite, TypeScript and three.js. It's mobile-first (touch joystick, drag to look, pinch to zoom), also plays on desktop (WASD, mouse drag, scroll, E), and has a Chinese/English UI.

Inspired by the online temple *Sansa* (山寺, sansatemple.com), with no affiliation. **Nothing is copied:** every building, character, texture and sound is generated in code in this repo, and no third-party models, images, fonts or recordings are used. The only runtime dependency is three.js (MIT).

## Features

| | |
|---|---|
| **Scene** | Mountain gate (山门) → 14 stone steps → walled courtyard with incense burner, well, water vat, stone lanterns and pines → double-eaved main hall (大雄宝殿) with red columns, curved roofs, a seated Buddha, altar and six cushions. Layered ink-wash ridges, a cloud sea and drifting mist. |
| **Name** | Each player gets a random calm dharma name, e.g. 明山 MingShan, shown in a small label above their head. |
| **Actions** | 礼拜 bow · 合十 join palms (nearby monks return the greeting) · 念珠 108-bead ring with counter and rounds · 木鱼 wooden fish with a 功德 merit counter. |
| **Practices (日课)** | Sweep 5 piles of pine needles · carry 3 trips of water from the well to the vat · 33 strikes of the wooden fish · one round of 108 beads · 3 bows · offer incense. Each one earns 修为 XP. Finishing all six adds a streak bonus. |
| **Ranks** | 沙弥 → 行者 (300) → 居士 (900) → 比丘 (2000) → 法师 (4000) → 禅师 (7000). Each rank unlocks a robe colour, a bead style, an accessory and a new area. |
| **Areas** | 钟楼 bell tower (ring the bell) · 莲池 lotus pond with koi and a pavilion (sit) · 竹林 bamboo grove (sit) · 藏经阁 sutra pavilion (read the Heart Sutra) · 云顶 summit (sit above the temple). Sitting quietly earns 2 XP a minute. |
| **Daily reset** | The checklist resets at 00:00 Beijing time (UTC+8, whatever the device's time zone), with a practice streak and a best streak. |
| **Cushion bowing** | Step onto a hall cushion to bow repeatedly. Each bow counts until you stand up. |
| **Group chanting (共修)** | At 06:00, 12:00, 18:00 and 21:00 Beijing time, for 10 minutes. Every client derives the same syllable from the server-synced clock, so everyone hears 南无阿弥陀佛 and the opening of the Heart Sutra in step. Simulated monks gather on the cushions. Add `?chant=1` to the URL, or press ▶ in the Sound panel, to preview it. |
| **Sound** | Wind, birds, temple bell, eave chimes, wooden fish, beads, sweeping, water and a chanting chorus, all synthesised with Web Audio. Sound starts only after a tap. There's a mute button and a mixer (master, wind, birds, bells, chanting, actions). |
| **Other monks** | Seven simulated residents go about their own practices. When the API is configured, real players appear too (presence every 4 s), and simulated monks step back as real ones arrive. |
| **Accounts** | Guest by default, with progress in `localStorage`. Optional email magic-link login syncs across devices, and guest progress is merged in when you log in, not lost. |

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 — includes the API with an in-memory store
npm test           # progression rules (node --test)
npm run build      # typecheck + production build to dist/
```

In `vite dev`, `/api/*` runs `api/temple.ts` in-process. Without Upstash variables it uses an in-memory store, and the login form shows the magic link on screen instead of emailing it, so you can test login and sync locally.

## Deploy (Vercel, free tiers)

1. Import the repo into Vercel. `vercel.json` sets the Vite framework and rewrites `/api/:op` to the single function `api/temple.ts`.
2. **Storage:** create a free Upstash Redis database (Vercel Marketplace → Upstash, or console.upstash.com) and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. (`KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Marketplace integration also work.)
3. **Email:** login emails need a provider. The code supports **Resend** (free tier: 3,000 emails a month). Set `RESEND_API_KEY` and `EMAIL_FROM`; until you verify a domain in Resend, the sender must be `onboarding@resend.dev` and it can only email your own address.
   Without an email key, production returns "email not configured" and everyone stays a guest. `DEV_MAGIC_LINK=1` makes the API return the link in the response; **never set it in production**, because anyone could then log in as any email.
4. Optionally set `APP_BASE_URL` (e.g. `https://temple.example.com`) for the links in emails.

Without any variables, the deployed site still works fully as a guest-only, offline-progress game with simulated monks.

### Free-tier budget

Upstash's free plan allows roughly 500K commands a month. Presence costs about 2–3 commands per player every 4 s (about 2,000 an hour), sent only while the tab is visible. Sync costs a few commands per change, debounced to 5 s. That's on the order of a couple of hundred player-hours a month. If it grows, raise the presence interval in `src/main.ts`.

## API (`api/temple.ts`)

| op | body | result |
|---|---|---|
| `GET time` | — | `{ now, storage }`, used for clock sync |
| `request-link` | `{ email, lang }` | emails a 15-minute single-use link; rate-limited per email (60 s) and per IP |
| `verify` | `{ token }` | `{ session, email }`; the session lasts 60 days |
| `load` / `save` | `{ session, rev, progress }` | revisioned save (compare-and-set in Lua); returns `409` on a stale `rev`, and the client re-merges and retries |
| `presence` | `{ id, n:[i,j], x, z, ry, act, robe }` | `{ players }` seen in the last 15 s |
| `logout` | `{ session }` | — |

Tokens and sessions are stored only as SHA-256 hashes. Presence accepts no free text: names travel as two indices into the name tables, and `act`/`robe` are whitelisted, so nothing a client sends can show up as arbitrary text for other players.

## Layout

```
src/
  main.ts            boot, splash, login callback, sync + presence loops
  game.ts            scene, player modes, interactions, chanting, presence rendering
  chant.ts           Beijing-time chanting schedule and shared syllable clock
  net.ts             API client (time, magic link, load/merge/save, presence)
  i18n.ts            zh / en strings
  audio/audio.ts     Web Audio synthesis + mixer
  state/             progression rules (pure), names, Beijing time, local store
  world/             layout (walkable zones), environment, temple, nature, monk, controls, NPCs, labels
  ui/hud.ts          HUD, overlays, panels
api/temple.ts        serverless API (self-contained)
tests/               node --test
```

## Next round

- A real chanting voice could replace the synthesised chorus. It would have to be recorded for this project or properly licensed.
- More presence detail (equipped beads and accessories, shared bell ringing).
- Seasonal and day/night lighting tied to Beijing time.
