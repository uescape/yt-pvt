# YouTube policy and quota

Curato depends on the YouTube API Services Terms and Developer Policies. Losing API access would end the product, so treat this file as a checklist before every release. *This is engineering guidance, not legal advice. Read the current policies yourself: https://developers.google.com/youtube/terms/developer-policies*

## What we do and don't do

| Rule | How Curato complies |
| --- | --- |
| Don't block, skip or alter ads | We use the official IFrame player as-is. No ad detection, no seeking past ads, nothing covering the player while it plays. Our controls appear only after remote input and hide after 4 s. |
| Don't download or cache video/audio | We cache only metadata (titles, durations, flags). Video plays through the official player. |
| Don't offer background play or downloads | Not implemented. |
| Don't sell or charge for access to YouTube content | Monetize Curato's own features (multiple profiles, schedules, more TVs), never "videos". Check the monetization section of the policies before adding paid plans. |
| Don't suggest you are YouTube | The name contains no "YouTube", "YT" or "Tube", and the app shows "not affiliated with YouTube or Google". YouTube's branding appears only inside the player. |
| Show the ToS and privacy links | Mobile settings link to the YouTube ToS and the Google Privacy Policy. **TODO:** publish a Curato privacy policy that states you use YouTube API Services, and link it from both apps and every store listing. |
| Refresh stored API data | Channels refresh at least every 7 days, video metadata when channels refresh. **TODO:** before the compliance audit, add a job that deletes videos not refreshed in 30 days. |
| Don't hide or modify the player | `controls=0` is an official parameter. We don't hide YouTube's branding or ad UI. |
| Respect embedding settings | Videos the owner doesn't allow embedded, and age-restricted ones, are filtered out. Player errors 101/150/152 are reported so the video is hidden for everyone. |

**SponsorBlock** marks creator-read sponsor segments, which are not YouTube ads. Curato only offers a button that the viewer presses; nothing skips automatically. It's off by default in kids profiles. If YouTube ever objects, remove it in one place: `sponsorSkip` in the player settings.

## Quota

The default allowance is **10,000 units per day** per Google Cloud project.

| Call | Units | Used for |
| --- | --- | --- |
| `channels.list` (id, handle or username) | 1 | Resolving pasted links and handles |
| `playlistItems.list` | 1 | A channel's newest uploads |
| `videos.list` (up to 50 ids) | 1 | Video details: length, made-for-kids flag, embed size, region rules |
| `videos.list?chart=mostPopular` | 1 | Trending, per region and category, cached 3 h |
| `search.list` | **100** | Channel search by name only (cached 7 days, limited per household) |

**Rough capacity.** Background refreshes may use 80% of a 9,000-unit budget, about 7,200 units a day. Refreshing a channel costs 2 units, so refreshing every 3 hours (8 times a day) costs 16 units per channel per day. That supports about **450 distinct actively watched channels** at the default quota. When more channels are active, the cron job automatically refreshes each one less often. Channels are shared: a popular kids channel counts once, however many families follow it.

**Growing past that.** Apply for a quota extension through the YouTube API compliance audit form. Google reviews the app against the policies above. Have the privacy policy, the data-deletion job and store listings ready first.

## TV store reviews

- Every store will ask why a third-party app plays YouTube. Answer: it uses the official YouTube embedded player and the Data API under the YouTube API Services Terms, ads intact, to provide parental filtering.
- Don't use YouTube logos or screenshots of the YouTube app in store listings. Use screenshots of Curato's own UI.
