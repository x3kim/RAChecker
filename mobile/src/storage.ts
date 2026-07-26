// Persistence for the mobile app: RA credentials (username in AsyncStorage, the
// API key in the OS secure store) + a tiny TTL JSON cache (profile, later game
// details). The hash DB itself will move to expo-sqlite in a later slice.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const K_USER = 'ra_user';
const K_FOLDER = 'ra_folder';
const SK_KEY = 'ra_api_key'; // secure-store key (alphanumeric + ._- only)

export type Creds = { username: string; apiKey: string };

export async function getCreds(): Promise<Creds | null> {
  const username = await AsyncStorage.getItem(K_USER);
  const apiKey = await SecureStore.getItemAsync(SK_KEY);
  if (username && apiKey) return { username, apiKey };
  return null;
}
export async function setCreds(username: string, apiKey: string): Promise<void> {
  await AsyncStorage.setItem(K_USER, username.trim());
  await SecureStore.setItemAsync(SK_KEY, apiKey.trim());
}
export async function clearCreds(): Promise<void> {
  await AsyncStorage.removeItem(K_USER);
  await SecureStore.deleteItemAsync(SK_KEY);
}

export async function getFolder(): Promise<string | null> { return AsyncStorage.getItem(K_FOLDER); }
export async function setFolder(uri: string): Promise<void> { await AsyncStorage.setItem(K_FOLDER, uri); }

const K_SYSTEMS = 'ra_systems';   // JSON number[] of console ids to sync, or absent = all
const K_ONBOARDED = 'ra_onboarded';

export async function getSelectedConsoles(): Promise<number[] | null> {
  const raw = await AsyncStorage.getItem(K_SYSTEMS);
  if (!raw) return null;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
}
export async function setSelectedConsoles(ids: number[] | null): Promise<void> {
  if (ids && ids.length) await AsyncStorage.setItem(K_SYSTEMS, JSON.stringify(ids));
  else await AsyncStorage.removeItem(K_SYSTEMS);
}

export async function isOnboarded(): Promise<boolean> { return (await AsyncStorage.getItem(K_ONBOARDED)) === '1'; }
export async function setOnboarded(): Promise<void> { await AsyncStorage.setItem(K_ONBOARDED, '1'); }

// Small TTL cache keyed by name (persists last profile so it loads offline).
export async function getCache<T>(key: string, ttlMs: number): Promise<T | null> {
  const raw = await AsyncStorage.getItem('cache_' + key);
  if (!raw) return null;
  try {
    const { at, v } = JSON.parse(raw);
    if (Date.now() - at > ttlMs) return null;
    return v as T;
  } catch {
    return null;
  }
}
export async function setCache<T>(key: string, v: T): Promise<void> {
  await AsyncStorage.setItem('cache_' + key, JSON.stringify({ at: Date.now(), v }));
}
