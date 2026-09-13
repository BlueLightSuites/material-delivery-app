import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Makes access-token expiry invisible: a request that comes back 401 is
 * retried once with a freshly minted token.
 *
 * AuthContext renews proactively (on a timer and on return to
 * foreground), but that closes the window rather than eliminating it - a
 * request already in flight when the token expires still fails. This is
 * the reactive half.
 *
 * Installed on the global axios instance, which is what the REST
 * services use. authService deliberately uses its own axios instance, so
 * the token-refresh call itself can never be intercepted here - which is
 * what would otherwise turn a failed refresh into infinite recursion.
 */

/** Returns a fresh access token, or null if the session is unrecoverable. */
type RefreshHandler = () => Promise<string | null>;

let refreshHandler: RefreshHandler | null = null;
let interceptorId: number | null = null;

/**
 * The single in-flight refresh, shared by every caller that needs one.
 *
 * This is the part that can't be skipped: Supabase rotates refresh
 * tokens, so each refresh consumes the previous one. Without this,
 * concurrent 401s (the driver feed alone fires two queries at once) would
 * each start their own refresh, the first would invalidate the token the
 * others are using, and the failures would sign the user out for no
 * reason - a worse outcome than the expiry being fixed.
 */
let inFlightRefresh: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!inFlightRefresh) {
    const handler = refreshHandler;
    inFlightRefresh = (handler ? handler() : Promise.resolve(null))
      .catch(() => null)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

// Marks a config as already retried, so a request that is genuinely
// unauthorized (rather than merely expired) fails instead of looping.
type RetriableConfig = InternalAxiosRequestConfig & { __retriedAfterRefresh?: boolean };

export function installAuthInterceptor(handler: RefreshHandler): void {
  refreshHandler = handler;

  if (interceptorId !== null) {
    return;
  }

  interceptorId = axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;

      if (error.response?.status !== 401 || !config || config.__retriedAfterRefresh) {
        return Promise.reject(error);
      }

      config.__retriedAfterRefresh = true;

      const token = await refreshOnce();
      if (!token) {
        return Promise.reject(error);
      }

      config.headers.set('Authorization', `Bearer ${token}`);
      return axios.request(config);
    }
  );
}

export function uninstallAuthInterceptor(): void {
  if (interceptorId !== null) {
    axios.interceptors.response.eject(interceptorId);
    interceptorId = null;
  }
  refreshHandler = null;
}
