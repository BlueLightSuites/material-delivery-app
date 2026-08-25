import React, { useState } from 'react';
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
  DeliveryRequest,
} from '../../services/api/deliveryRequests';

type JobsNearbyNavigationProp = StackNavigationProp<MainStackParamList, 'JobsNearby'>;

interface JobsNearbyProps {
  navigation: JobsNearbyNavigationProp;
}

const JobsNearby: React.FC<JobsNearbyProps> = ({ navigation }) => {
  const { accessToken } = useAuth();
  const [jobs, setJobs] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchJobs = async () => {
    if (!accessToken) {
      return;
    }

    try {
      setLoading(true);
      const data = await getDeliveryRequests(accessToken, 'status=eq.pending');
      setJobs(data);
    } catch (error) {
      console.error('fetchJobs: Error fetching pending jobs:', error);
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
    }, [accessToken])
  );

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
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Available Jobs</Text>
          <Text style={styles.headerSubtitle}>
            {jobs.length} pending {jobs.length === 1 ? 'request' : 'requests'}
          </Text>
        </View>

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
