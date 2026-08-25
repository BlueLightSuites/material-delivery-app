import * as SecureStore from 'expo-secure-store';
import { User } from '../../models/User';

const ACCESS_TOKEN_KEY = 'md_access_token';
const REFRESH_TOKEN_KEY = 'md_refresh_token';
const USER_KEY = 'md_user';

export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Persist a session to the device Keychain (iOS) / EncryptedSharedPreferences
 * (Android) via expo-secure-store. Stored as three separate keys rather than
 * one JSON blob to stay well under SecureStore's per-item size limit.
 */
export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
  ]);
}

/**
 * Load a previously persisted session, if one exists. Does not validate the
 * access token — callers are expected to refresh it before trusting it.
 */
export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, userJson] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ]);

  if (!accessToken || !refreshToken || !userJson) {
    return null;
  }

  try {
    return { accessToken, refreshToken, user: JSON.parse(userJson) as User };
  } catch (error) {
    console.error('loadSession: Failed to parse stored user', error);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}
