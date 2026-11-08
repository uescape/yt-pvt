/** localStorage can throw (private mode, quota, disabled storage on some TVs): never let it crash the app. */
function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const storage = {
  getToken: () => get('curato.deviceToken'),
  setToken: (t: string | null) => set('curato.deviceToken', t),
  getLastProfile: () => get('curato.lastProfile'),
  setLastProfile: (id: string | null) => set('curato.lastProfile', id),
};
