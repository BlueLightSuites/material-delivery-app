import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import {
  getDeliveryRequests,
  acceptDeliveryRequest,
  acknowledgeCancelledJob,
  DeliveryRequest,
} from '../../services/api/deliveryRequests';
import BottomNavBar from '../../components/navigation/BottomNavBar';
import { getCurrentPosition, distanceInMiles, Coordinates } from '../../services/geolocation';

type JobsNearbyNavigationProp = StackNavigationProp<MainStackParamList, 'JobsNearby'>;

interface JobsNearbyProps {
  navigation: JobsNearbyNavigationProp;
}

const JobsNearby: React.FC<JobsNearbyProps> = ({ navigation }) => {
  const { accessToken, user } = useAuth();
  const [jobs, setJobs] = useState<DeliveryRequest[]>([]);
  const [activeJobs, setActiveJobs] = useState<DeliveryRequest[]>([]);
  const [cancelledJobs, setCancelledJobs] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [driverPosition, setDriverPosition] = useState<Coordinates | null>(null);

  // Asked for once on mount rather than on every focus, so a driver who
  // declines the permission prompt isn't re-prompted every time they come
  // back to the feed. Null just means distances are hidden.
  useEffect(() => {
    getCurrentPosition().then(setDriverPosition);
  }, []);

  const fetchJobs = async () => {
    if (!accessToken) {
      return;
    }

    try {
      setLoading(true);
      // Accepting a job flips it out of 'pending', so the open-jobs query
      // alone would leave a driver with no route back to a job they've
      // taken - and no way to reach the status actions on it.
      const [pending, mine, cancelled] = await Promise.all([
        getDeliveryRequests(accessToken, 'status=eq.pending'),
        user?.auth_id
          ? getDeliveryRequests(
              accessToken,
              `assigned_driver_id=eq.${user.auth_id}&status=in.(assigned,in_transit)`
            )
          : Promise.resolve([]),
        // Cancelled jobs this driver hasn't acknowledged yet. These stay
        // put until dismissed rather than disappearing, so a driver who
        // missed the push still learns why the job is gone.
        user?.auth_id
          ? getDeliveryRequests(
              accessToken,
              `assigned_driver_id=eq.${user.auth_id}&status=eq.cancelled&driver_ack_cancelled_at=is.null`
            )
          : Promise.resolve([]),
      ]);
      setJobs(pending);
      setActiveJobs(mine);
      setCancelledJobs(cancelled);
    } catch (error) {
      console.error('fetchJobs: Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchJobs();
    }, [accessToken, user?.auth_id])
  );

  const handleDismissCancelled = async (jobId: string) => {
    if (!accessToken) {
      return;
    }
    // Removed locally first: the acknowledgement is a courtesy record,
    // not something worth making the driver wait on or retry.
    setCancelledJobs((prev) => prev.filter((job) => job.id !== jobId));
    acknowledgeCancelledJob(accessToken, jobId);
  };

  const handleAccept = async (jobId: string) => {
    if (!accessToken) {
      Alert.alert('Authentication required', 'Please sign in again before accepting a job.');
      return;
    }

    setAcceptingId(jobId);
    try {
      const accepted = await acceptDeliveryRequest(accessToken, jobId);

      if (accepted) {
        setJobs((prev) => prev.filter((job) => job.id !== jobId));
        Alert.alert('Job Accepted', "You're now assigned to this delivery.");
      } else {
        Alert.alert(
          'Already Taken',
          'Another driver accepted this job first. Refreshing the list.'
        );
        fetchJobs();
      }
    } finally {
      setAcceptingId(null);
    }
  };

  // Only requests created after location capture shipped carry coordinates,
  // so older rows simply show no distance rather than a wrong one.
  const pickupDistance = (item: DeliveryRequest): string | null => {
    if (!driverPosition || item.pickup_lat == null || item.pickup_lng == null) {
      return null;
    }
    const miles = distanceInMiles(driverPosition, { lat: item.pickup_lat, lng: item.pickup_lng });
    return miles < 10 ? `${miles.toFixed(1)} mi away` : `${Math.round(miles)} mi away`;
  };

  const renderJobCard = ({ item }: { item: DeliveryRequest }) => (
    <View style={styles.jobCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.materialText}>{item.material_category}</Text>
        <Text style={styles.quantityText}>
          {item.material_weight} {item.material_unit}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {item.pickup_address}
          </Text>
          {pickupDistance(item) && (
            <Text style={styles.distanceText}>{pickupDistance(item)}</Text>
          )}
        </View>
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>🎯</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {item.dropoff_address}
          </Text>
        </View>
        {item.requires_trailer && (
          <View style={styles.trailerBadge}>
            <Text style={styles.trailerBadgeText}>🚛 Trailer required</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => item.id && navigation.navigate('JobDetail', { jobId: item.id })}
        >
          <Text style={styles.viewDetailsText}>View Details →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => item.id && handleAccept(item.id)}
          disabled={acceptingId === item.id}
        >
          {acceptingId === item.id ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.acceptButtonText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Available Jobs</Text>
          <Text style={styles.headerSubtitle}>
            {jobs.length} pending {jobs.length === 1 ? 'request' : 'requests'}
          </Text>
        </View>

        {cancelledJobs.length > 0 && (
          <View style={styles.activeSection}>
            <Text style={styles.activeSectionTitle}>Cancelled</Text>
            {cancelledJobs.map((job) => (
              <View key={job.id} style={styles.cancelledCard}>
                <Text style={styles.cancelledTitle}>
                  {job.material_category} job cancelled
                </Text>
                <Text style={styles.cancelledBody}>
                  The contractor cancelled this pickup at {job.pickup_address}. You're free to
                  take new jobs.
                </Text>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => job.id && handleDismissCancelled(job.id)}
                >
                  <Text style={styles.dismissButtonText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {activeJobs.length > 0 && (
          <View style={styles.activeSection}>
            <Text style={styles.activeSectionTitle}>Your Active Jobs</Text>
            {activeJobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                style={styles.activeCard}
                onPress={() => job.id && navigation.navigate('JobDetail', { jobId: job.id })}
              >
                <View style={styles.activeCardHeader}>
                  <Text style={styles.materialText}>{job.material_category}</Text>
                  <Text style={styles.activeStatusText}>
                    {job.status === 'in_transit' ? 'In transit' : 'Assigned'}
                  </Text>
                </View>
                <Text style={styles.locationText} numberOfLines={1}>
                  📍 {job.pickup_address}
                </Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  🎯 {job.dropoff_address}
                </Text>
                <Text style={styles.viewDetailsText}>
                  {job.status === 'in_transit' ? 'Mark delivered →' : 'Start delivery →'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading && jobs.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066CC" />
            <Text style={styles.loadingText}>Loading jobs...</Text>
          </View>
        ) : jobs.length > 0 ? (
          <View style={styles.jobsList}>
            <FlatList
              data={jobs}
              keyExtractor={(item) => item.id || ''}
              renderItem={renderJobCard}
              scrollEnabled={false}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🚚</Text>
            <Text style={styles.emptyTitle}>No Jobs Right Now</Text>
            <Text style={styles.emptySubtitle}>
              Pull down to check for new delivery requests.
            </Text>
          </View>
        )}
      </ScrollView>
      <BottomNavBar
        items={[
          { key: 'jobs', icon: '🚚', label: 'Jobs', onPress: () => navigation.navigate('JobsNearby') },
          { key: 'earnings', icon: '💰', label: 'Earnings', onPress: () => navigation.navigate('Earnings') },
          { key: 'profile', icon: '👤', label: 'Profile', onPress: () => navigation.navigate('Profile') },
        ]}
      />
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999999',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999999',
  },
  cancelledCard: {
    backgroundColor: '#FFF6F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7A9A2',
    padding: 16,
    marginBottom: 12,
  },
  cancelledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8A3B2C',
    marginBottom: 6,
  },
  cancelledBody: {
    fontSize: 13,
    color: '#6B4A43',
    lineHeight: 19,
  },
  dismissButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8A3B2C',
  },
  dismissButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A3B2C',
  },
  activeSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  activeSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  activeCard: {
    backgroundColor: '#F5F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0066CC',
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  activeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  jobsList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
  },
  materialText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  quantityText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0066CC',
  },
  cardBody: {
    paddingHorizontal: 16,
    gap: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#666666',
    flex: 1,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    marginLeft: 8,
  },
  trailerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  trailerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E65100',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 12,
    gap: 12,
  },
  detailsButton: {
    flex: 1,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  acceptButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
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
  },
});

export default JobsNearby;
