import type { Store } from '../store/types';
import { HttpError } from '../lib/errors';

/** The YouTube Data API quota resets at midnight Pacific time. */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export type QuotaPriority = 'interactive' | 'background';

export class QuotaExceededError extends HttpError {
  constructor() {
    super(503, 'quota_exhausted', 'Daily YouTube quota is used up. Cached videos are still available; new data resumes after midnight Pacific time.');
  }
}

/**
 * Tracks our own spend against a daily budget so we stop *before* YouTube starts returning errors.
 * Background work (cron refreshes) may only use 80% of the budget, keeping the rest for parents
 * adding channels and TVs opening profiles.
 */
export class QuotaGuard {
  constructor(
    private readonly store: Store,
    private readonly budget: number,
    private readonly now: () => Date,
  ) {}

  private key() {
    return `quota:${quotaDay(this.now())}`;
  }

  async used(): Promise<number> {
    return this.store.getCounter(this.key());
  }

  async remaining(priority: QuotaPriority = 'interactive'): Promise<number> {
    const limit = priority === 'background' ? Math.floor(this.budget * 0.8) : this.budget;
    return Math.max(0, limit - (await this.used()));
  }

  /** Reserves units up-front; throws if that would exceed the budget for this priority. */
  async spend(units: number, priority: QuotaPriority): Promise<void> {
    const limit = priority === 'background' ? Math.floor(this.budget * 0.8) : this.budget;
    const total = await this.store.incrementCounter(this.key(), units);
    if (total > limit) {
      await this.store.incrementCounter(this.key(), -units);
      throw new QuotaExceededError();
    }
  }

  /** YouTube told us we're out: stop spending for the rest of the day. */
  async exhaust(): Promise<void> {
    const used = await this.used();
    if (used < this.budget) await this.store.incrementCounter(this.key(), this.budget - used);
  }
}
