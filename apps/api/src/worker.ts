import { createApp, createServices, type Deps } from './app';
import { D1Store } from './store/d1';

export interface Env {
  DB: D1Database;
  YOUTUBE_API_KEY: string;
  QUOTA_DAILY_BUDGET?: string;
  SEARCHES_PER_HOUSEHOLD_PER_DAY?: string;
}

function depsFromEnv(env: Env): Deps {
  return {
    store: new D1Store(env.DB),
    youtubeApiKey: env.YOUTUBE_API_KEY ?? '',
    quotaDailyBudget: Number(env.QUOTA_DAILY_BUDGET ?? 9000),
    searchesPerHouseholdPerDay: Number(env.SEARCHES_PER_HOUSEHOLD_PER_DAY ?? 15),
  };
}

const app = createApp((env) => depsFromEnv(env as Env));

/** Cron runs every 30 minutes (48x/day). Each run gets an even share of the remaining background budget. */
export async function runScheduledRefresh(deps: Deps): Promise<{ refreshed: number }> {
  const svc = createServices(deps);
  const remaining = await svc.quota.remaining('background');
  const now = svc.now();
  const minutesLeftToday = 24 * 60 - (now.getUTCHours() * 60 + now.getUTCMinutes());
  const runsLeft = Math.max(1, Math.ceil(minutesLeftToday / 30));
  // A channel refresh costs 2 units.
  const maxChannels = Math.min(500, Math.floor(remaining / runsLeft / 2));
  if (maxChannels <= 0) return { refreshed: 0 };
  return { refreshed: await svc.catalog.refreshStaleChannels(maxChannels) };
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledRefresh(depsFromEnv(env)).then((r) => console.log('refresh', r)));
  },
} satisfies ExportedHandler<Env>;
