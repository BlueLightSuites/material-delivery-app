import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import {
  getDeliveryRequestById,
  acceptDeliveryRequest,
  advanceDeliveryStatus,
  DeliveryRequest,
} from '../../services/api/deliveryRequests';
import BottomNavBar from '../../components/navigation/BottomNavBar';
import { useDriverLocationReporter } from '../../hooks/useDriverLocationReporter';

type JobDetailNavigationProp = StackNavigationProp<MainStackParamList, 'JobDetail'>;
type JobDetailRouteProp = RouteProp<MainStackParamList, 'JobDetail'>;

interface JobDetailProps {
  navigation: JobDetailNavigationProp;
  route: JobDetailRouteProp;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Open',
  assigned: 'Assigned to you',
  in_transit: 'In transit',
  completed: 'Delivered',
};

const JobDetail: React.FC<JobDetailProps> = ({ navigation, route }) => {
  const { jobId } = route.params;
  const { accessToken, user } = useAuth();

  const [job, setJob] = useState<DeliveryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    const data = await getDeliveryRequestById(accessToken, jobId);
    setJob(data);
    setLoading(false);
  }, [accessToken, jobId]);

  useFocusEffect(
    useCallback(() => {
      fetchJob();
    }, [fetchJob])
  );

  const isMine = !!job && !!user && job.assigned_driver_id === user.auth_id;

  // Only while this driver actually holds an in-progress job - the RPC
  // enforces the same condition server-side, so a stale report is
  // rejected rather than trusted.
  useDriverLocationReporter(
    jobId,
    isMine && (job?.status === 'assigned' || job?.status === 'in_transit')
  );

  const handleAccept = async () => {
    if (!accessToken) {
      Alert.alert('Authentication required', 'Please sign in again before accepting a job.');
      return;
    }
    setActionInFlight(true);
    try {
      const accepted = await acceptDeliveryRequest(accessToken, jobId);
      if (accepted) {
        setJob(accepted);
        Alert.alert('Job Accepted', "You're now assigned to this delivery.");
      } else {
        Alert.alert(
          'Already Taken',
          'Another driver accepted this job first.',
          [{ text: 'OK', onPress: () => navigation.navigate('JobsNearby') }]
        );
      }
    } finally {
      setActionInFlight(false);
    }
  };

  const handleAdvance = async (nextStatus: 'in_transit' | 'completed') => {
    if (!accessToken) {
      return;
    }
    setActionInFlight(true);
    try {
      const updated = await advanceDeliveryStatus(accessToken, jobId, nextStatus);
      if (updated) {
        setJob(updated);
        if (nextStatus === 'completed') {
          Alert.alert('Delivery Complete', 'Nice work — this job is marked delivered.');
        }
      } else {
        Alert.alert('Out of Sync', "This job's status changed. Refreshing.");
        fetchJob();
      }
    } finally {
      setActionInFlight(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Job Not Found</Text>
          <Text style={styles.subtitle}>
            This request may have been taken or is no longer available.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('JobsNearby')}>
            <Text style={styles.primaryButtonText}>Back to Jobs</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[job.status || ''] || job.status}</Text>
          </View>
          <Text style={styles.materialText}>{job.material_category}</Text>
          <Text style={styles.quantityText}>
            {job.material_weight} {job.material_unit}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Route</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationCaption}>Pickup</Text>
              <Text style={styles.locationText}>{job.pickup_address}</Text>
            </View>
          </View>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationCaption}>Dropoff</Text>
              <Text style={styles.locationText}>{job.dropoff_address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Trailer required</Text>
            <Text style={styles.detailValue}>{job.requires_trailer ? 'Yes' : 'No'}</Text>
          </View>
          {!!job.notes && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.detailKey}>Notes</Text>
              <Text style={styles.notesText}>{job.notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {job.status === 'pending' && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAccept}
            disabled={actionInFlight}
          >
            {actionInFlight ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Accept Job</Text>
            )}
          </TouchableOpacity>
        )}

        {job.status === 'assigned' && isMine && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => handleAdvance('in_transit')}
            disabled={actionInFlight}
          >
            {actionInFlight ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Delivery</Text>
            )}
          </TouchableOpacity>
        )}

        {job.status === 'in_transit' && isMine && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => handleAdvance('completed')}
            disabled={actionInFlight}
          >
            {actionInFlight ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Mark Delivered</Text>
            )}
          </TouchableOpacity>
        )}

        {job.status === 'completed' && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('JobsNearby')}>
            <Text style={styles.primaryButtonText}>Back to Jobs</Text>
          </TouchableOpacity>
        )}
      </View>

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
    alignSelf: 'flex-start',
    backgroundColor: '#E6F0FA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  materialText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666666',
    marginTop: 4,
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
    marginBottom: 12,
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
  subtitle: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 20,
  },
  actionBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default JobDetail;
