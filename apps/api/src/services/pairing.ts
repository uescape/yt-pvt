import type { PairStartResponse, PairStatusResponse } from '@curato/core';
import { randomDigits, randomId, randomToken, sha256Hex, timingSafeEqual } from '../lib/crypto';
import { HttpError, notFound, tooMany } from '../lib/errors';
import type { Store } from '../store/types';

const PAIRING_TTL_MS = 10 * 60_000;
const CLAIM_ATTEMPTS_PER_HOUR = 20;

/**
 * Netflix-style TV pairing:
 * 1. TV calls start() and shows a 6-digit code.
 * 2. Parent types the code in the phone app -> claim().
 * 3. TV polls status() and receives its long-lived device token exactly once.
 */
export class PairingService {
  constructor(private readonly d: { store: Store; now: () => Date }) {}

  async start(platform: string): Promise<PairStartResponse> {
    const nowIso = this.d.now().toISOString();
    let code = randomDigits(6);
    for (let i = 0; i < 5 && (await this.d.store.findActivePairingByCode(code, nowIso)); i++) code = randomDigits(6);
    const pollToken = randomToken();
    const id = randomId();
    const expiresAt = new Date(this.d.now().getTime() + PAIRING_TTL_MS).toISOString();
    await this.d.store.insertPairing({
      id,
      code,
      pollTokenHash: await sha256Hex(pollToken),
      platform: platform.slice(0, 20) || 'unknown',
      expiresAt,
      householdId: null,
      deviceName: null,
      consumed: false,
    });
    return { pairingId: id, code, pollToken, expiresAt };
  }

  async claim(householdId: string, code: string, deviceName: string): Promise<void> {
    const hourKey = `claim:${householdId}:${this.d.now().toISOString().slice(0, 13)}`;
    if ((await this.d.store.incrementCounter(hourKey, 1)) > CLAIM_ATTEMPTS_PER_HOUR) {
      throw tooMany('Too many pairing attempts. Try again in an hour.');
    }
    const pairing = await this.d.store.findActivePairingByCode(code, this.d.now().toISOString());
    if (!pairing) throw notFound('Pairing code (it may have expired – check the code on your TV)');
    await this.d.store.updatePairing(pairing.id, { householdId, deviceName: deviceName.trim().slice(0, 40) || 'TV' });
  }

  async status(pairingId: string, pollToken: string): Promise<PairStatusResponse> {
    const pairing = await this.d.store.getPairing(pairingId);
    if (!pairing || !timingSafeEqual(pairing.pollTokenHash, await sha256Hex(pollToken))) {
      throw new HttpError(404, 'not_found', 'Pairing not found');
    }
    if (pairing.consumed) return { status: 'expired' };
    if (pairing.householdId) {
      if (!(await this.d.store.consumePairing(pairing.id))) return { status: 'expired' };
      const token = randomToken();
      await this.d.store.insertToken({
        id: randomId(),
        tokenHash: await sha256Hex(token),
        householdId: pairing.householdId,
        kind: 'tv',
        name: pairing.deviceName ?? 'TV',
        platform: pairing.platform,
        createdAt: this.d.now().toISOString(),
        lastSeenAt: null,
      });
      return { status: 'paired', deviceToken: token };
    }
    if (pairing.expiresAt <= this.d.now().toISOString()) return { status: 'expired' };
    return { status: 'pending', expiresAt: pairing.expiresAt };
  }
}
