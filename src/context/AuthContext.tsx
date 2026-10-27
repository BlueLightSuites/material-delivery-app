import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { User } from '../models/User';
import {
  loadSession,
  saveSession,
  clearSession,
  migrateSessionAccessibility,
} from '../services/auth/sessionService';
import { refreshSession } from '../services/firebase/authService';
import {
  installAuthInterceptor,
  uninstallAuthInterceptor,
  refreshOnce,
} from '../services/api/authInterceptor';
import {
  registerForPushNotifications,
  savePushToken,
  clearPushToken,
} from '../services/notifications';

// Supabase access tokens last an hour. The app renews once one is within
// this margin of expiring - checked on a timer and on every return to the
// foreground - rather than on every foreground regardless.
//
// Renewing on every unlock rotated the refresh token several times a
// minute, and each rotation is a moment where the app holds a new token
// it hasn't saved yet. Lose that save (iOS suspending or ending the app
// right after an unlock) and the next launch presents an already-used
// token, which Supabase refuses - a sign-out.
const RENEW_MARGIN_MS = 10 * 60 * 1000;
const RENEW_CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (changes: Partial<User>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // Starts true: App.tsx should keep showing a loading state until the
  // session-restore attempt below finishes, otherwise every launch flashes
  // the sign-in screen for a moment even when the user is still logged in.
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  // Held in a ref rather than state: renewing rotates it, and every
  // rotation re-rendering the whole app (and re-running the effects that
  // schedule the next renewal) would be needless churn.
  const refreshTokenRef = useRef<string | null>(null);
  // Null means unknown (just signed in, or restored offline), which is
  // treated as due for renewal.
  const expiresAtRef = useRef<number | null>(null);
  // Mirrors `user` for renewAccessToken, which has to save the session
  // without waiting for a render to read state.
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /**
   * Exchange the stored refresh token for a fresh access token, rotating
   * the refresh token as Supabase hands back a new one.
   *
   * Only a refusal from Supabase ends the session. Any other failure -
   * typically no network for a moment after the phone unlocks - keeps it
   * and returns null; the next foreground, timer tick, or 401 tries again.
   *
   * Never call this directly: go through refreshOnce(), so overlapping
   * triggers share one refresh instead of consuming each other's token.
   */
  const renewAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentRefreshToken) {
      return null;
    }

    const refreshed = await refreshSession(currentRefreshToken);

    if (refreshed.accessToken && refreshed.refreshToken) {
      refreshTokenRef.current = refreshed.refreshToken;
      expiresAtRef.current = refreshed.expiresAt;
      // Saved before anything else happens, and awaited. Supabase has
      // already retired the old refresh token, so until this lands the
      // only copy of the new one is in memory - which iOS can discard at
      // any moment once the app is backgrounded. (It used to be saved
      // inside a state update, which doesn't run until the next render:
      // unlock, renew, lock again, and it never ran at all.)
      const currentUser = userRef.current;
      if (currentUser) {
        try {
          await saveSession({
            user: currentUser,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          });
        } catch (error) {
          console.error('renewAccessToken: could not save renewed session', error);
        }
      }
      setAccessToken(refreshed.accessToken);
      return refreshed.accessToken;
    } else if (!refreshed.rejected) {
      console.warn('renewAccessToken: refresh failed, keeping session to retry', refreshed.error);
      return null;
    } else {
      console.warn('renewAccessToken: refresh token rejected, signing out');
      refreshTokenRef.current = null;
      expiresAtRef.current = null;
      setUser(null);
      setAccessToken(null);
      await clearSession();
      return null;
    }
  }, []);

  /** Renew if the access token is unknown or close to expiring. */
  const renewIfDue = useCallback(() => {
    const expiresAt = expiresAtRef.current;
    if (expiresAt === null || expiresAt - Date.now() < RENEW_MARGIN_MS) {
      refreshOnce();
    }
  }, []);

  // Installed once for the life of the provider, not per token change:
  // the handler reads the refresh token from a ref, so it never goes
  // stale, and reinstalling would drop in-flight retries.
  useEffect(() => {
    installAuthInterceptor(renewAccessToken);
    return () => uninstallAuthInterceptor();
  }, [renewAccessToken]);

  useEffect(() => {
    const restoreSession = async () => {
      let stored;
      try {
        stored = await loadSession();
      } catch (error) {
        // The Keychain refused the read - typically a session saved before
        // the accessibility change in sessionService, read while locked.
        // Show sign-in for now but leave the stored session alone: it's
        // intact, and the next launch can read it.
        console.warn('restoreSession: could not read stored session', error);
        setIsLoading(false);
        return;
      }

      if (!stored) {
        setIsLoading(false);
        return;
      }

      // Now, while the Keychain is known to be readable - see
      // migrateSessionAccessibility for why not on the save path.
      try {
        await migrateSessionAccessibility(stored);
      } catch (error) {
        console.warn('restoreSession: keychain accessibility migration failed', error);
      }

      // Always refresh on launch rather than trusting the stored access
      // token's expiry - simpler than decoding the JWT client-side, and
      // confirms the refresh token itself is still valid.
      const refreshed = await refreshSession(stored.refreshToken);

      if (!refreshed.accessToken && !refreshed.rejected) {
        // Launched without a connection. Restore the stored session as
        // is: the access token may have expired, but the first request to
        // need a new one will refresh it, rather than the user being sent
        // to sign in by a phone that's merely offline.
        refreshTokenRef.current = stored.refreshToken;
        setUser(stored.user);
        setAccessToken(stored.accessToken);
        setIsLoading(false);
        return;
      }

      if (refreshed.accessToken && refreshed.refreshToken) {
        refreshTokenRef.current = refreshed.refreshToken;
        expiresAtRef.current = refreshed.expiresAt;
        // Saved before the app proceeds, same as renewAccessToken: the
        // stored token was just retired.
        await saveSession({
          user: stored.user,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        });
        setUser(stored.user);
        setAccessToken(refreshed.accessToken);
      } else {
        // Refresh token is invalid or expired - fall back to sign-in.
        await clearSession();
      }

      setIsLoading(false);
    };

    restoreSession();
  }, []);

  // Registered whenever there's a session, not just at login: the token
  // can be reissued by the OS (reinstall, restore from backup), and a
  // stale one silently sends notifications nowhere.
  useEffect(() => {
    if (!accessToken || !user?.auth_id) {
      return;
    }

    let cancelled = false;
    registerForPushNotifications().then((token) => {
      if (token && !cancelled && user.auth_id) {
        savePushToken(accessToken, user.auth_id, token);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.auth_id]);

  // Two triggers, because neither covers the other's case. The timer
  // handles an app left open past the token's lifetime; the foreground
  // check handles an app that was backgrounded, where iOS suspends JS
  // timers - which is exactly how a session expires unnoticed and every
  // request comes back 401 the moment the user returns.
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const interval = setInterval(renewIfDue, RENEW_CHECK_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        renewIfDue();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, renewIfDue]);

  const login = async (nextUser: User, nextAccessToken: string, nextRefreshToken: string) => {
    refreshTokenRef.current = nextRefreshToken;
    // Unknown until the first renewal reports it; renewIfDue treats that
    // as due, so the first foreground after sign-in renews once and from
    // then on only near expiry.
    expiresAtRef.current = null;
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    await saveSession({
      user: nextUser,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    });
  };

  // For profile changes made after sign-in. Persisted with the session
  // because launch restores the user from it rather than refetching -
  // otherwise the old value comes back on the next restart.
  const updateUser = async (changes: Partial<User>) => {
    if (!user) {
      return;
    }
    const nextUser = { ...user, ...changes };
    setUser(nextUser);
    if (accessToken && refreshTokenRef.current) {
      await saveSession({
        user: nextUser,
        accessToken,
        refreshToken: refreshTokenRef.current,
      });
    }
  };

  const logout = async () => {
    // Before the session is torn down, while the token still authorizes
    // the write - otherwise the next person to sign in on this device
    // would keep receiving the previous user's delivery notifications.
    if (accessToken && user?.auth_id) {
      await clearPushToken(accessToken, user.auth_id);
    }

    refreshTokenRef.current = null;
    setUser(null);
    setAccessToken(null);
    await clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isLoading,
        setIsLoading,
        accessToken,
        setAccessToken,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
