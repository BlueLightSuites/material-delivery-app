import * as Location from 'expo-location';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Turn a typed address into coordinates using the platform geocoder
 * (CoreLocation on iOS, android.location.Geocoder on Android).
 *
 * Returns null rather than throwing when the address can't be resolved -
 * a delivery request is still perfectly usable with a free-text address
 * and null coordinates, so callers should treat coordinates as an
 * enrichment and never block a submit on this.
 *
 * No location permission is needed: geocoding an address the user typed
 * doesn't read the device's own position.
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const results = await Location.geocodeAsync(trimmed);
    const first = results[0];
    return first ? { lat: first.latitude, lng: first.longitude } : null;
  } catch (error) {
    console.error('geocodeAddress error', { address: trimmed, error });
    return null;
  }
}

/**
 * Read the device's current position, asking for foreground permission
 * first. Returns null if permission is denied or the fix fails, so a
 * caller can degrade (e.g. show jobs without distances) instead of
 * blocking on location the user may never grant.
 */
export async function getCurrentPosition(): Promise<Coordinates | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch (error) {
    console.error('getCurrentPosition error', error);
    return null;
  }
}

const EARTH_RADIUS_MILES = 3958.8;

/**
 * Great-circle distance in miles. Straight-line, not driving distance -
 * enough to sort and label a job feed, not enough to quote a delivery.
 */
export function distanceInMiles(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
