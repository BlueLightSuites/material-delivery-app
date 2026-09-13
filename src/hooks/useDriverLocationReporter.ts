import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { reportDriverLocation } from '../services/api/deliveryRequests';

/**
 * While `active`, stream the driver's position to the given request so
 * the contractor can watch the delivery move.
 *
 * Foreground only, deliberately. Background location would keep
 * reporting with the app closed, but it needs the "always" permission,
 * a background mode entitlement, and a much harder App Store
 * justification - and a driver is looking at this screen while
 * delivering. If that assumption turns out to be wrong in real use,
 * upgrading is a permissions change rather than a rewrite: the server
 * side is identical.
 *
 * watchPositionAsync is used rather than a setInterval around
 * getCurrentPositionAsync so the OS decides when the position has
 * actually changed enough to be worth a fix, instead of waking the GPS
 * on a fixed schedule to report that a parked truck hasn't moved.
 */
export function useDriverLocationReporter(requestId: string | undefined, active: boolean) {
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!active || !requestId || !accessToken) {
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    // The await below means this effect can be torn down before the
    // subscription exists; without this flag that subscription would
    // leak and keep reporting after the screen is gone.
    let cancelled = false;

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED || cancelled) {
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 25,
        },
        (position) => {
          reportDriverLocation(
            accessToken,
            requestId,
            position.coords.latitude,
            position.coords.longitude
          );
        }
      );

      if (cancelled) {
        subscription.remove();
        subscription = null;
      }
    };

    start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [requestId, active, accessToken]);
}
