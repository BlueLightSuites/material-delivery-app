import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;

/**
 * Show notifications that arrive while the app is open. Without this the
 * OS suppresses them in the foreground, which reads as "push is broken"
 * during testing when it's actually working.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for permission and return this device's Expo push token.
 *
 * Returns null rather than throwing for every expected "no token" case -
 * a simulator, a declined prompt - because none of them are errors worth
 * interrupting the user over. They just mean this device won't receive
 * notifications.
 *
 * Simulators are handled by the catch rather than an up-front check:
 * getExpoPushTokenAsync throws there, which lands in the same place. The
 * explicit check used expo-device, whose SDK 48 version fails to compile
 * under Xcode 16 ("cannot find 'TARGET_OS_SIMULATOR' in scope"), and a
 * dependency that breaks the build isn't worth a slightly clearer log
 * line.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    // Only prompt if undetermined. Asking again after a denial does
    // nothing on iOS - the OS never shows a second prompt - so the user
    // would have to be sent to Settings instead.
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      // Two channels, not one. Android lets the user mute each
      // independently in system settings, so a driver who silences
      // routine updates doesn't also silence being told their active job
      // was cancelled - which is operational, not informational. A single
      // channel would force that all-or-nothing choice.
      await Notifications.setNotificationChannelAsync('job-alerts', {
        name: 'Job alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('updates', {
        name: 'Delivery updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (error) {
    console.error('registerForPushNotifications error', error);
    return null;
  }
}

/**
 * Store the device's push token against the signed-in user, which is
 * what lets the database trigger find somewhere to send to.
 *
 * Writes directly rather than through an RPC: the existing
 * "Users can update their own profile" policy already scopes this to the
 * caller's own row.
 */
export async function savePushToken(
  accessToken: string,
  authId: string,
  pushToken: string
): Promise<boolean> {
  try {
    await axios.patch(
      `${API_URL}/rest/v1/users?auth_id=eq.${authId}`,
      { expo_push_token: pushToken },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return true;
  } catch (error: any) {
    console.error('savePushToken error', {
      status: error?.response?.status,
      data: error?.response?.data,
    });
    return false;
  }
}

/**
 * Clear the token on sign-out so the next person to use this device
 * doesn't receive the previous user's delivery notifications.
 */
export async function clearPushToken(accessToken: string, authId: string): Promise<void> {
  try {
    await axios.patch(
      `${API_URL}/rest/v1/users?auth_id=eq.${authId}`,
      { expo_push_token: null },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  } catch (error) {
    console.error('clearPushToken error', error);
  }
}
