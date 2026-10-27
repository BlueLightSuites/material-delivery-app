import * as SecureStore from 'expo-secure-store';
import { User } from '../../models/User';

const ACCESS_TOKEN_KEY = 'md_access_token';
const REFRESH_TOKEN_KEY = 'md_refresh_token';
const USER_KEY = 'md_user';

// Readable from the first unlock after a restart onward, rather than the
// default of only while unlocked. iOS can launch the app in the
// background while the phone is locked (prewarming, notification
// handling), and a session that can't be read then looks exactly like no
// session: the user is shown sign-in. Still encrypted, still this app's
// alone, and never copied to another device.
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

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
    writeItem(ACCESS_TOKEN_KEY, session.accessToken),
    writeItem(REFRESH_TOKEN_KEY, session.refreshToken),
    writeItem(USER_KEY, JSON.stringify(session.user)),
  ]);
}

// Delete, then add. Writing over an existing item updates only its value
// and keeps the accessibility it was created with, so sessions saved
// before KEYCHAIN_OPTIONS existed would stay unreadable while locked
// forever. Saves happen at sign-in and on token renewal, not per request.
async function writeItem(key: string, value: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
  await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
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
