# Architecture

## Goals

1. **Safe by construction.** The TV never receives a video that fails a rule. All filtering happens on the server, and every unknown is treated as "hide": an unknown "made for kids" flag hides the video, and an unknown length hides it when a length limit is set.
2. **One TV codebase, four stores.** Samsung, LG, Android TV/Google TV and Fire TV all run the same web app.
3. **Fit the YouTube API quota.** All households share one cache, so 1,000 households following the same channel cost the same as one.
4. **Stay within YouTube's policies** so the app can be published in the stores. See [COMPLIANCE.md](COMPLIANCE.md).

## Components

### `packages/core`
Pure TypeScript, used by all three apps.

- `filterRulesSchema` / `profileInputSchema` (zod): the profile model, validated on both client and server.
- `createVideoFilter(rules, ctx)`: compiles rules once and returns a predicate that reports a reason for every exclusion. The parent app's preview screen uses these reasons to explain why each video was hidden.
- `isLikelyShort`: the Data API has no "is Short" flag, so this combines signals:
  - The embed's aspect ratio (`player.embedWidth/embedHeight` < 1 means vertical), which comes free in the same `videos.list` call.
  - Length ≤ 180 s.
  - A fallback for when the aspect ratio is unknown: ≤ 60 s or tagged `#shorts`.
- `compileKeywordMatcher`: whole-word, diacritic-insensitive matching, with phrases and `prefix*` wildcards. Works for non-Latin scripts too (Urdu and Arabic are tested).
- `parseChannelInput`: turns any pasted URL, handle, id or video link into the cheapest API lookup.

### `apps/api` (Cloudflare Worker + D1)

| Route | Who | Purpose |
| --- | --- | --- |
| `POST /v1/households` | phone, first run | Creates the household and returns the manager token |
| `GET/PUT /v1/household` | phone | Region, PIN, list of paired TVs |
| `POST /v1/pair/claim` | phone | Enters the TV's 6-digit code |
| `DELETE /v1/devices/:id` | phone | Unpairs a TV |
| `GET/POST/PUT/DELETE /v1/profiles…` | phone | Profile management |
| `GET /v1/profiles/:id/preview` | phone | What the TV will show, plus counts of hidden videos by reason |
| `GET /v1/channels/resolve?input=` | phone | Link, handle or id to channel (1 unit) |
| `GET /v1/channels/search?q=` | phone | Name search (100 units; cached 7 days, 15 per household per day) |
| `POST /v1/tv/pair/start`, `GET /v1/tv/pair/:id` | TV | Pairing; the device token is issued exactly once |
| `GET /v1/tv/session` | TV | List of profiles |
| `GET /v1/tv/profiles/:id/home` | TV | Filtered rows |
| `POST /v1/tv/verify-pin` | TV | PIN check, rate-limited to 5 attempts per 10 minutes |
| `POST /v1/tv/report-unplayable` | TV | Hides videos whose owners disabled embedding, for everyone |

**Auth.** Random 256-bit bearer tokens; the database stores only their SHA-256 hashes. Manager (phone) and TV tokens are separate kinds, so a TV can't change rules. PINs are hashed with PBKDF2-SHA256 (100k iterations).

**The YouTube cache.** `channels` and `videos` are shared between households. A channel refresh costs 2 units: `playlistItems.list` on the uploads playlist plus `videos.list` for the 50 newest uploads. When a TV opens a profile, channels that have never been fetched load immediately. Channels that are merely out of date are refreshed by the 30-minute cron job, oldest first, within an even share of the remaining daily budget. Background work may only use 80% of the budget; the rest is kept for parents adding channels.

**Quota guard.** Every call is reserved against a daily counter, which resets at midnight Pacific time like YouTube's quota. If YouTube itself reports `quotaExceeded`, the counter is set to the budget so nothing more is attempted that day. TVs keep working from the cache.

### `apps/tv` (Preact web app)

- **Small and old-browser friendly.** About 19 KB gzipped, compiled to ES2015 as a classic script (no ES modules), with no flexbox `gap`. Runs on 2018-era Samsung (Tizen 4, Chromium 56) and LG (webOS 4, Chromium 53) TVs.
- **Spatial navigation** (`src/focus.ts`): geometric nearest-neighbour search, focus trapping inside modals, and per-row memory, so moving back up into a row returns to the card you left.
- **Remote keys** (`src/input.ts`): handles Samsung Back (10009), LG Back (461), the Android shell's Back bridge, and media keys.
- **Player** (`src/screens/Player.tsx`): the official IFrame API with `controls=0`, using our own remote-friendly controls that auto-hide. A "Skip sponsor" button (viewer-pressed only) is optional. When a video ends, our "Up next" screen covers YouTube's end screen, so nothing outside the profile can be opened from the player.
- **Hosted, not packaged.** The Samsung/LG/Android packages open `https://your-domain/`. This gives the YouTube embed a real https origin and referrer; embeds without one fail with error 152/153. It also means TV updates ship without store re-review.

### `apps/mobile` (Expo)
Expo Router screens: welcome/PIN, profiles and TVs, profile editor, channel picker (paste a link first, search second), preview, and settings. The manager token is kept in the OS keychain (`expo-secure-store`).

### `platforms/*`
- `android-tv`: one Kotlin activity hosting a WebView. It forwards the Back key to the web app, blocks top-level navigation to other sites (so the YouTube logo can't open youtube.com), keeps the screen on, and shows an offline page. One APK covers Google Play (TV) and the Amazon Appstore (Fire TV).
- `tizen`, `webos`: launcher packages that open the hosted app, with an offline retry screen.

## Known limitations and next steps

- **Ad skip buttons.** Ads play inside YouTube's iframe, and a D-pad can't focus into it. Skippable ads will usually play to the end. Pointer remotes (LG Magic Remote) can click Skip. Test on real hardware; if this matters, consider a native player SDK where available.
- **The TV's built-in YouTube app.** Curato can't uninstall or block it. The TV settings screen and the phone app tell parents how to lock it with the TV's own parental controls.
- **Apple TV.** tvOS has no WebView, so it would need a native app using an allowed playback path. Not in v1.
- **Roku.** There's no way to embed YouTube on Roku that complies with the terms. Not supported.
- **No account recovery in v1.** The household belongs to the phone's token. Next: Sign in with Apple/Google, plus invites for a second parent.
- **Watch-time limits and schedules** (e.g. "1 hour a day, not after 8 pm") would fit naturally into the TV session endpoint.
- **AI topic filters** (e.g. "no prank or drama content") could classify titles server-side once per video, sharing results across households like the rest of the cache.
