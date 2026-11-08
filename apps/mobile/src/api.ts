import type {
  ChannelMeta,
  CreateHouseholdResponse,
  HouseholdResponse,
  PreviewResponse,
  Profile,
  ProfileInput,
  ProfileKind,
} from '@curato/core';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'curato.managerToken';

/** Set `extra.apiBaseUrl` in app.json (or EXPO_PUBLIC_API_BASE_URL) to your deployed worker. */
const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'No connection to Curato. Check your internet and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  createHousehold: (input: { region: string; pin?: string; deviceName?: string }) =>
    request<CreateHouseholdResponse>('POST', '/v1/households', input),
  household: () => request<HouseholdResponse>('GET', '/v1/household'),
  updateHousehold: (patch: { region?: string; pin?: string | null }) => request<{ ok: true }>('PUT', '/v1/household', patch),

  claimTv: (code: string, deviceName: string) => request<{ ok: true }>('POST', '/v1/pair/claim', { code, deviceName }),
  removeDevice: (id: string) => request<{ ok: true }>('DELETE', `/v1/devices/${encodeURIComponent(id)}`),

  profiles: async () => (await request<{ profiles: Profile[] }>('GET', '/v1/profiles')).profiles,
  profile: (id: string) => request<Profile>('GET', `/v1/profiles/${encodeURIComponent(id)}`),
  createProfile: (preset: ProfileKind, name: string) => request<Profile>('POST', '/v1/profiles', { preset, name }),
  saveProfile: (id: string, input: ProfileInput) => request<Profile>('PUT', `/v1/profiles/${encodeURIComponent(id)}`, input),
  deleteProfile: (id: string) => request<{ ok: true }>('DELETE', `/v1/profiles/${encodeURIComponent(id)}`),
  preview: (id: string) => request<PreviewResponse>('GET', `/v1/profiles/${encodeURIComponent(id)}/preview`),

  channels: async (ids: string[]) =>
    ids.length === 0 ? [] : (await request<{ channels: ChannelMeta[] }>('GET', `/v1/channels?ids=${ids.join(',')}`)).channels,
  resolveChannel: async (input: string) =>
    (await request<{ channel: ChannelMeta }>('GET', `/v1/channels/resolve?input=${encodeURIComponent(input)}`)).channel,
  searchChannels: async (q: string) => (await request<{ channels: ChannelMeta[] }>('GET', `/v1/channels/search?q=${encodeURIComponent(q)}`)).channels,
};
