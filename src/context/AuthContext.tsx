import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../models/User';
import { loadSession, saveSession, clearSession } from '../services/auth/sessionService';
import { refreshSession } from '../services/firebase/authService';

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

  const login = async (nextUser: User, nextAccessToken: string, nextRefreshToken: string) => {
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    await saveSession({
      user: nextUser,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    });
  };

  const logout = async () => {
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
