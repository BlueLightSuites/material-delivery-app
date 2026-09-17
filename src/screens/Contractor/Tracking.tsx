import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import {
  getDeliveryRequestById,
  cancelDeliveryRequest,
  DeliveryRequest,
} from '../../services/api/deliveryRequests';
import {
  DELIVERY_STATUS_ORDER,
  statusColor,
  statusLabel,
  statusDescription,
  isStatusReached,
  isCancelled,
} from '../../models/deliveryStatus';
import BottomNavBar from '../../components/navigation/BottomNavBar';
import { subscribeToDeliveryRequest } from '../../services/realtime/supabaseRealtime';
import { distanceInMiles, estimateMinutesAway } from '../../services/geolocation';

const POLL_INTERVAL_MS = 10000;

// A fix older than this is stale enough that presenting it as "where the
// driver is" would be misleading - the app was probably backgrounded, or
// the driver lost signal.
const STALE_LOCATION_MS = 2 * 60 * 1000;

type TrackingNavigationProp = StackNavigationProp<MainStackParamList, 'Tracking'>;
type TrackingRouteProp = RouteProp<MainStackParamList, 'Tracking'>;

interface TrackingProps {
  navigation: TrackingNavigationProp;
  route: TrackingRouteProp;
}

const formatTimestamp = (value?: string): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
};

const Tracking: React.FC<TrackingProps> = ({ navigation, route }) => {
  const { requestId } = route.params;
  const { accessToken } = useAuth();

  const [request, setRequest] = useState<DeliveryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequest = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    const data = await getDeliveryRequestById(accessToken, requestId);
    setRequest(data);
    setLoading(false);
  }, [accessToken, requestId]);

  useFocusEffect(
    useCallback(() => {
      fetchRequest();
    }, [fetchRequest])
  );

  const isLive = request?.status === 'assigned' || request?.status === 'in_transit';

  // Live updates, with polling as a fallback rather than an either/or.
  // Realtime is the better experience when it connects, but this app
  // otherwise avoids the Supabase SDK on Hermes grounds, so a channel
  // that fails must degrade to something that works instead of leaving a
  // screen that silently never updates. Polling only starts if the
  // subscription reports a problem.
  const [realtimeFailed, setRealtimeFailed] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!accessToken || !isLive || realtimeFailed) {
      return;
    }

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      subscription = subscribeToDeliveryRequest(
        accessToken,
        requestId,
        (row) => setRequest((current) => ({ ...current, ...row } as DeliveryRequest)),
        () => setRealtimeFailed(true)
      );
    } catch (error) {
      console.error('Tracking: realtime subscribe threw, falling back to polling', error);
      setRealtimeFailed(true);
    }

    return () => subscription?.unsubscribe();
  }, [accessToken, requestId, isLive, realtimeFailed]);

  useEffect(() => {
    if (!isLive || !realtimeFailed) {
      return;
    }

    pollTimer.current = setInterval(fetchRequest, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, [isLive, realtimeFailed, fetchRequest]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequest();
    setRefreshing(false);
  };

  const navItems = [
    { key: 'requests', icon: '📋', label: 'Requests', onPress: () => navigation.navigate('RequestList') },
    { key: 'new', icon: '➕', label: 'New', onPress: () => navigation.navigate('NewRequest', { requestId: undefined }) },
    { key: 'profile', icon: '👤', label: 'Profile', onPress: () => navigation.navigate('Profile') },
  ];

  const [cancelling, setCancelling] = useState(false);

  // Only while nobody is carrying the load yet. The RPC enforces the
  // same window server-side, so this governs the button, not the rule.
  const canCancel = request?.status === 'pending' || request?.status === 'assigned';

  const handleCancel = () => {
    Alert.alert(
      'Cancel this request?',
      request?.status === 'assigned'
        ? 'A driver has already accepted this job and will be notified that it is cancelled.'
        : 'This request will be withdrawn. No driver has accepted it yet.',
      [
        { text: 'Keep request', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) {
              return;
            }
            setCancelling(true);
            try {
              const cancelled = await cancelDeliveryRequest(accessToken, requestId);
              if (cancelled) {
                setRequest(cancelled);
              } else {
                Alert.alert(
                  'Could not cancel',
                  "This request's status changed - it may already be in transit. Refreshing."
                );
                fetchRequest();
              }
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
        <BottomNavBar items={navItems} />
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Request Not Found</Text>
          <Text style={styles.emptySubtitle}>
            This request may have been removed, or you may not have access to it.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('RequestList')}
          >
            <Text style={styles.primaryButtonText}>Back to Requests</Text>
          </TouchableOpacity>
        </View>
        <BottomNavBar items={navItems} />
      </SafeAreaView>
    );
  }

  const accent = statusColor(request.status);
  const lastUpdated = formatTimestamp(request.updated_at || request.created_at);

  // Needs the dropoff coordinates as well as the driver's: requests
  // created before geocoding shipped have no dropoff fix, and there's no
  // honest distance to show without one.
  const driverLocation = (() => {
    if (
      !isLive ||
      request.driver_lat == null ||
      request.driver_lng == null ||
      request.dropoff_lat == null ||
      request.dropoff_lng == null
    ) {
      return null;
    }

    const reportedAt = request.driver_location_updated_at
      ? new Date(request.driver_location_updated_at)
      : null;
    const stale = !reportedAt || Date.now() - reportedAt.getTime() > STALE_LOCATION_MS;

    const milesAway = distanceInMiles(
      { lat: request.driver_lat, lng: request.driver_lng },
      { lat: request.dropoff_lat, lng: request.dropoff_lng }
    );

    return {
      stale,
      milesAway,
      minutesAway: estimateMinutesAway(milesAway),
      updatedLabel: formatTimestamp(request.driver_location_updated_at || undefined) || 'unknown',
    };
  })();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={[styles.statusBadge, { backgroundColor: `${accent}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text style={[styles.statusText, { color: accent }]}>{statusLabel(request.status)}</Text>
          </View>
          <Text style={styles.headerTitle}>{request.material_category}</Text>
          <Text style={styles.headerSubtitle}>
            {request.material_weight} {request.material_unit}
          </Text>
          <Text style={styles.statusDescription}>{statusDescription(request.status)}</Text>
          {lastUpdated && <Text style={styles.updatedText}>Last updated {lastUpdated}</Text>}
        </View>

        {isCancelled(request.status) ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Progress</Text>
            <Text style={styles.cancelledNotice}>
              This request was cancelled{lastUpdated ? ` on ${lastUpdated}` : ''}. It is no longer
              visible to drivers.
            </Text>
          </View>
        ) : (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Progress</Text>
          {DELIVERY_STATUS_ORDER.map((step, index) => {
            const reached = isStatusReached(step, request.status);
            const isCurrent = step === request.status;
            const isLast = index === DELIVERY_STATUS_ORDER.length - 1;

            return (
              <View key={step} style={styles.timelineRow}>
                <View style={styles.timelineGutter}>
                  <View
                    style={[
                      styles.timelineDot,
                      reached && { backgroundColor: statusColor(step), borderColor: statusColor(step) },
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  />
                  {!isLast && (
                    <View
                      style={[styles.timelineLine, reached && { backgroundColor: statusColor(step) }]}
                    />
                  )}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={[styles.timelineLabel, reached && styles.timelineLabelReached]}>
                    {statusLabel(step)}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.timelineDescription}>{statusDescription(step)}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        )}

        {driverLocation && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Driver Location</Text>
            {driverLocation.stale ? (
              <Text style={styles.staleText}>
                Last known position was {driverLocation.updatedLabel}. The driver's app may be
                closed or out of signal.
              </Text>
            ) : (
              <>
                <Text style={styles.etaText}>About {driverLocation.minutesAway} min away</Text>
                <Text style={styles.etaSubtext}>
                  {driverLocation.milesAway.toFixed(1)} mi from the dropoff, straight line —
                  actual driving time will be longer.
                </Text>
                <Text style={styles.updatedText}>Updated {driverLocation.updatedLabel}</Text>
              </>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Route</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationCaption}>Pickup</Text>
              <Text style={styles.locationText}>{request.pickup_address}</Text>
            </View>
          </View>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationCaption}>Dropoff</Text>
              <Text style={styles.locationText}>{request.dropoff_address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Trailer required</Text>
            <Text style={styles.detailValue}>{request.requires_trailer ? 'Yes' : 'No'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Requested</Text>
            <Text style={styles.detailValue}>{formatTimestamp(request.created_at) || '—'}</Text>
          </View>
          {!!request.notes && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.detailKey}>Notes</Text>
              <Text style={styles.notesText}>{request.notes}</Text>
            </View>
          )}
        </View>

        {request.status === 'pending' && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.navigate('NewRequest', { requestId: requestId })}
          >
            <Text style={styles.editButtonText}>Edit request</Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#B3261E" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel this request</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
      <BottomNavBar items={navItems} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666666',
    marginTop: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: '#1A1A1A',
    marginTop: 12,
    lineHeight: 20,
  },
  updatedText: {
    fontSize: 12,
    color: '#999999',
    marginTop: 6,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  etaText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  etaSubtext: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
    lineHeight: 18,
  },
  staleText: {
    fontSize: 13,
    color: '#8A6D3B',
    lineHeight: 19,
  },
  cancelledNotice: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
  editButton: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  cancelButton: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B3261E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B3261E',
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineGutter: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D0D0D0',
    backgroundColor: '#FFFFFF',
  },
  timelineDotCurrent: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 26,
    backgroundColor: '#E8E8E8',
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 18,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#999999',
    fontWeight: '500',
  },
  timelineLabelReached: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  timelineDescription: {
    fontSize: 13,
    color: '#666666',
    marginTop: 3,
    lineHeight: 18,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  locationCaption: {
    fontSize: 11,
    color: '#999999',
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailKey: {
    fontSize: 13,
    color: '#666666',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  notesText: {
    fontSize: 13,
    color: '#1A1A1A',
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default Tracking;
