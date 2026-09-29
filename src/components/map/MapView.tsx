import React, { useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Coordinates } from '../../services/geolocation';

interface DeliveryMapProps {
  pickup?: Coordinates | null;
  dropoff?: Coordinates | null;
  driver?: Coordinates | null;
  /** Dims the driver marker when the last fix is old enough to mistrust. */
  driverStale?: boolean;
}

// Enough padding that markers aren't flush against the edges, and a floor
// so two nearby points don't zoom to street level and look broken.
const REGION_PADDING = 1.6;
const MIN_DELTA = 0.02;

function regionFor(points: Coordinates[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * REGION_PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * REGION_PADDING, MIN_DELTA),
  };
}

/**
 * The delivery plotted: pickup, dropoff, and the driver when one is
 * reporting.
 *
 * Uses the platform default map provider, which is Apple Maps on iOS -
 * no API key and no billing. Android would need a Google Maps key, but
 * there's no Android project yet.
 *
 * The region is set once rather than driven by props. A map that
 * recentres itself every time a new position arrives fights the user
 * the moment they try to pan or zoom, so movement is shown by the
 * marker moving, and the recentre button puts everything back in frame
 * on demand.
 */
const DeliveryMap: React.FC<DeliveryMapProps> = ({ pickup, dropoff, driver, driverStale }) => {
  const mapRef = useRef<MapView>(null);

  const points = [pickup, dropoff, driver].filter((p): p is Coordinates => !!p);

  // Requests created before geocoding shipped have no coordinates at
  // all, and a map of nothing is worse than no map.
  if (points.length === 0) {
    return null;
  }

  const recenter = () => {
    mapRef.current?.fitToCoordinates(
      points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
    );
  };

  return (
    <View style={styles.wrapper}>
      <MapView ref={mapRef} style={styles.map} initialRegion={regionFor(points)}>
        {pickup && (
          <Marker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            title="Pickup"
            pinColor="#0066CC"
          />
        )}
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            title="Dropoff"
            pinColor="#10B981"
          />
        )}
        {driver && (
          <Marker
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            title={driverStale ? 'Driver (last known)' : 'Driver'}
            opacity={driverStale ? 0.5 : 1}
          >
            <Text style={styles.driverMarker}>🚚</Text>
          </Marker>
        )}

        {/* Straight line, not a route. It shows which two points are
            involved; drawing a road path would need a directions API and
            would imply we know the driver's actual route, which we
            don't. */}
        {pickup && dropoff && (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: dropoff.lat, longitude: dropoff.lng },
            ]}
            strokeColor="#0066CC"
            strokeWidth={3}
            lineDashPattern={[6, 6]}
          />
        )}
      </MapView>

      <TouchableOpacity style={styles.recenterButton} onPress={recenter}>
        <Text style={styles.recenterText}>Recenter</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  map: {
    height: 220,
    width: '100%',
  },
  driverMarker: {
    fontSize: 28,
  },
  recenterButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  recenterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
});

export default DeliveryMap;
