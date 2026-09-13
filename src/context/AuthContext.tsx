import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { User } from '../models/User';
import { loadSession, saveSession, clearSession } from '../services/auth/sessionService';
import { refreshSession } from '../services/firebase/authService';
import { installAuthInterceptor, uninstallAuthInterceptor } from '../services/api/authInterceptor';
import {
  registerForPushNotifications,
  savePushToken,
  clearPushToken,
} from '../services/notifications';

// Supabase access tokens last an hour. Renew comfortably inside that so a
// long-lived screen doesn't start 401ing mid-session.
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
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

  /**
   * Exchange the stored refresh token for a fresh access token, rotating
   * the refresh token as Supabase hands back a new one. A failure here
   * means the refresh token itself is dead, so the session is cleared and
   * the user lands back on sign-in - retrying wouldn't help.
   */
  const renewAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentRefreshToken) {
      return null;
    }

    const refreshed = await refreshSession(currentRefreshToken);

    if (refreshed.accessToken && refreshed.refreshToken) {
      refreshTokenRef.current = refreshed.refreshToken;
      setAccessToken(refreshed.accessToken);
      setUser((currentUser) => {
        if (currentUser) {
          saveSession({
            user: currentUser,
            accessToken: refreshed.accessToken as string,
            refreshToken: refreshed.refreshToken as string,
          });
        }
        return currentUser;
      });
      return refreshed.accessToken;
    } else {
      console.warn('renewAccessToken: refresh token rejected, signing out');
      refreshTokenRef.current = null;
      setUser(null);
      setAccessToken(null);
      await clearSession();
      return null;
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
      const stored = await loadSession();

      if (!stored) {
        setIsLoading(false);
        return;
      }

      // Always refresh on launch rather than trusting the stored access
      // token's expiry - simpler than decoding the JWT client-side, and
      // confirms the refresh token itself is still valid.
      const refreshed = await refreshSession(stored.refreshToken);

      if (refreshed.accessToken && refreshed.refreshToken) {
        refreshTokenRef.current = refreshed.refreshToken;
        setUser(stored.user);
        setAccessToken(refreshed.accessToken);
        await saveSession({
          user: stored.user,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        });
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

    const interval = setInterval(renewAccessToken, REFRESH_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        renewAccessToken();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, renewAccessToken]);

  const login = async (nextUser: User, nextAccessToken: string, nextRefreshToken: string) => {
    refreshTokenRef.current = nextRefreshToken;
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    await saveSession({
      user: nextUser,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    });
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
