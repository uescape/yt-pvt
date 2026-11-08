import type { HomeResponse, PairStartResponse, PairStatusResponse, TvSessionResponse } from '@curato/core';
import { mockApi } from './mock';
import { platform } from './platform';
import { storage } from './storage';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface TvApi {
  startPairing(): Promise<PairStartResponse>;
  pairingStatus(id: string, pollToken: string): Promise<PairStatusResponse>;
  session(): Promise<TvSessionResponse>;
  home(profileId: string): Promise<HomeResponse>;
  verifyPin(pin: string): Promise<boolean>;
  reportUnplayable(videoId: string): Promise<void>;
  unpair(): Promise<void>;
}

/** Same origin by default (the TV app is served by the API worker). Override with VITE_API_BASE for development. */
const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = storage.getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach Curato. Check the TV’s internet connection.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? `Request failed (${res.status})`);
  return data as T;
}

const httpApi: TvApi = {
  startPairing: () => request('POST', '/v1/tv/pair/start', { platform }),
  pairingStatus: (id, poll) => request('GET', `/v1/tv/pair/${encodeURIComponent(id)}?poll=${encodeURIComponent(poll)}`),
  session: () => request('GET', '/v1/tv/session'),
  home: (profileId) => request('GET', `/v1/tv/profiles/${encodeURIComponent(profileId)}/home`),
  verifyPin: async (pin) => (await request<{ ok: boolean }>('POST', '/v1/tv/verify-pin', { pin })).ok,
  reportUnplayable: async (videoId) => {
    await request('POST', '/v1/tv/report-unplayable', { videoId });
  },
  unpair: async () => {
    await request('DELETE', '/v1/tv/session');
  },
};

const useMock = /[?&]mock=1/.test(window.location.search) || import.meta.env.VITE_MOCK === '1';

export const api: TvApi = useMock ? mockApi : httpApi;
