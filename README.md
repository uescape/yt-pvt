# Curato

**A filtered, personalized YouTube for TVs, controlled from your phone.**

Smart TVs run the YouTube app directly, and there is almost no way to control what it shows. Curato replaces it with an app where *you* decide:

- **Approved channels only.** Kids profiles show nothing except channels a parent added.
- **Block channels, words and topics.** Applies everywhere, including trending.
- **No Shorts, no live streams, video length limits.**
- **"Made for kids" only.** These videos also get YouTube's restricted, non-personalized ads.
- **No endless autoplay** and no YouTube recommendations. When a video ends, the "Up next" screen shows only videos that pass your filters.
- **Parent PIN** for grown-up profiles and settings.
- **A preview** of exactly what the TV will show, and why each video was hidden.

Videos play in YouTube's **official embedded player, ads included**. Curato does not block ads or offer Premium features, which is what lets it be listed in the app stores.

| Where | What | Code |
| --- | --- | --- |
| Samsung TVs (Tizen) | TV app | `apps/tv` + `platforms/tizen` |
| LG TVs (webOS) | TV app | `apps/tv` + `platforms/webos` |
| Android TV, Google TV, Fire TV | TV app | `apps/tv` + `platforms/android-tv` |
| iPhone and Android phones | Parent app | `apps/mobile` (Expo) |
| Cloud | API, YouTube cache, filtering | `apps/api` (Cloudflare Workers + D1) |
| Shared | Rules, filter engine, types | `packages/core` |

## How it works

```
 Parent phone ──(rules)──► Curato API (Cloudflare Worker) ◄──(filtered feed)── TV app
                              │   │                                              │
                              │   └─ D1: profiles, shared YouTube cache          └─ official YouTube
                              └─ YouTube Data API (quota-managed)                   IFrame player (ads intact)
```

1. Open Curato on the TV. It shows a 6-digit code, which you type into the phone app (like pairing Netflix).
2. On the phone, create profiles and add channels by pasting a link or `@handle`.
3. The API fetches those channels' uploads, **filters them on the server**, and sends the TV only videos that passed. Blocked content never reaches the device.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, and [docs/COMPLIANCE.md](docs/COMPLIANCE.md) for the YouTube policy and quota strategy.

## Quick start (local)

Requirements: Node 20+ and pnpm 10.

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm typecheck
```

### See the TV UI without a backend

```bash
pnpm dev:tv
```

Open `http://localhost:5173/?mock=1` and use the arrow keys, Enter and Esc (Back). The demo PIN is `1234`.

### Run the full stack locally

1. Get a YouTube Data API v3 key: Google Cloud Console → APIs & Services → enable "YouTube Data API v3" → Credentials → API key.
2. Write the key to `apps/api/.dev.vars`:

   ```bash
   echo "YOUTUBE_API_KEY=your-key" > apps/api/.dev.vars
   ```

3. Create the local database, build the TV app and start the API. The Worker serves the TV app at `/`.

   ```bash
   pnpm --filter @curato/api db:migrate:local
   ```

   ```bash
   pnpm --filter @curato/tv build
   ```

   ```bash
   pnpm dev:api
   ```

4. Start the phone app. Set `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN address so the phone can reach the API.

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8787 pnpm dev:mobile
   ```

## Deploy

```bash
cd apps/api
```

```bash
npx wrangler d1 create curato
```

Copy the `database_id` it prints into `wrangler.toml`, then:

```bash
npx wrangler secret put YOUTUBE_API_KEY
```

```bash
pnpm db:migrate:remote
```

```bash
pnpm deploy
```

Point a domain at the Worker (e.g. `tv.yourdomain.com`). Then:

- Phone app: set `extra.apiBaseUrl` in `apps/mobile/app.json`.
- Android TV: set `curatoAppUrl` in `platforms/android-tv/gradle.properties`.
- Samsung and LG: `CURATO_APP_URL=https://tv.yourdomain.com/ pnpm package:tizen` (or `package:webos`).

Store submission for every platform is in [docs/STORES.md](docs/STORES.md).

## Repository layout

```
packages/core        Shared types, zod schemas, filter engine, Shorts detection, presets (tested)
apps/api             Cloudflare Worker: REST API, pairing, PIN, quota-aware YouTube client, cron refresh (tested)
apps/tv              TV web app (Preact, ~19 KB gzipped, D-pad navigation, runs on 2018+ TVs)
apps/mobile          Parent app (Expo / React Native, iOS + Android)
platforms/android-tv Kotlin WebView shell for Google Play (Android TV / Google TV) and Amazon (Fire TV)
platforms/tizen      Samsung package config
platforms/webos      LG package config
platforms/shared     Launcher page used by the Samsung/LG packages
scripts/             Icon/banner generator
docs/                Architecture, compliance, store submission
```

## Status

| Part | State |
| --- | --- |
| Filter engine, API, pairing, quota management | Built and unit-tested; API also run end-to-end against local D1 |
| TV app | Built; checked in a desktop browser with arrow-key navigation and mock data |
| Phone app | Typechecks and bundles for Android; not yet run on a device |
| Android TV shell | Written; needs the Android SDK to build (not run yet) |
| Samsung / LG packages | Generated; need vendor signing tools and real-TV testing |

**Before launch:** test YouTube playback on real TVs of each brand. That includes ad skip buttons inside the player, which a D-pad can't focus. See "Known limitations" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

*Curato is a working name. Change it in `apps/mobile/app.json`, `platforms/*` and the UI strings. Avoid "YouTube", "YT" or "Tube" in the name: YouTube's branding rules don't allow them.*
