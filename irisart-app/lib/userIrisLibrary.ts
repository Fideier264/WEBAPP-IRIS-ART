import * as FileSystem from 'expo-file-system/legacy';

export type UserIrisItem = {
  id: string;
  uri: string;
  fingerprint?: string;
  createdAt: number;
  lastUsedAt: number;
};

const LIB_FILE = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}irisart_user_library_v1.json`;
let loaded = false;
let mem: UserIrisItem[] = [];

async function loadIfNeeded() {
  if (loaded) return;
  loaded = true;
  try {
    const info = await FileSystem.getInfoAsync(LIB_FILE);
    if (!info.exists) {
      mem = [];
      return;
    }
    const raw = await FileSystem.readAsStringAsync(LIB_FILE);
    const parsed = JSON.parse(raw) as UserIrisItem[];
    mem = Array.isArray(parsed) ? parsed : [];
  } catch {
    mem = [];
  }
}

async function flush() {
  await FileSystem.writeAsStringAsync(LIB_FILE, JSON.stringify(mem));
}

function randomId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export async function getUserIrisLibrary(): Promise<UserIrisItem[]> {
  await loadIfNeeded();
  return [...mem].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

export async function upsertUserIris(uri: string, fingerprint?: string) {
  await loadIfNeeded();
  const now = Date.now();

  // Prefer dedupe by fingerprint, then fallback by uri.
  const idx =
    (fingerprint ? mem.findIndex((x) => x.fingerprint === fingerprint) : -1) >= 0
      ? mem.findIndex((x) => x.fingerprint === fingerprint)
      : mem.findIndex((x) => x.uri === uri);

  if (idx >= 0) {
    mem[idx] = {
      ...mem[idx],
      uri,
      fingerprint: fingerprint ?? mem[idx].fingerprint,
      lastUsedAt: now,
    };
  } else {
    mem.unshift({
      id: randomId(),
      uri,
      fingerprint,
      createdAt: now,
      lastUsedAt: now,
    });
  }

  // Keep recent collection bounded.
  if (mem.length > 250) mem = mem.slice(0, 250);
  await flush();
}

export async function removeUserIris(id: string) {
  await loadIfNeeded();
  mem = mem.filter((x) => x.id !== id);
  await flush();
}
