import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import { getDeliveryRequests, DeliveryRequest as DBDeliveryRequest } from '../../services/api/deliveryRequests';
import {
  statusColor,
  statusLabel,
  DELIVERY_STATUS_ORDER,
  DeliveryStatus,
} from '../../models/deliveryStatus';
import BottomNavBar from '../../components/navigation/BottomNavBar';

type RequestListNavigationProp = StackNavigationProp<MainStackParamList, 'RequestList'>;

// Derived from the status vocabulary rather than hand-listed, so a status
// added later can't silently end up with no tab to appear under.
const FILTER_TABS = ['all', ...DELIVERY_STATUS_ORDER] as const;

type FilterTab = 'all' | DeliveryStatus;

interface RequestListProps {
  navigation: RequestListNavigationProp;
}

const RequestList: React.FC<RequestListProps> = ({ navigation }) => {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [requests, setRequests] = useState<DBDeliveryRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch requests from database
  const fetchRequests = async () => {
    if (!accessToken || !user?.auth_id) {
      console.log('fetchRequests: Missing auth data');
      return;
    }

    try {
      setLoading(true);
      console.log('fetchRequests: Fetching for user:', user.auth_id);
      
      const filter = `auth_id=eq.${user.auth_id}`;
      const data = await getDeliveryRequests(accessToken, filter);
      
      console.log('fetchRequests: Received', data.length, 'requests');
      setRequests(data);
    } catch (error) {
      console.error('fetchRequests: Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  // Fetch requests when component mounts and when auth changes
  useEffect(() => {
    fetchRequests();
  }, [accessToken, user?.auth_id]);

  // Also refresh when returning to this screen
  useFocusEffect(
    React.useCallback(() => {
      fetchRequests();
    }, [accessToken, user?.auth_id])
  );

  const filteredRequests = requests.filter((req) => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const renderRequestCard = ({ item }: { item: DBDeliveryRequest }) => (
    <TouchableOpacity
      style={styles.requestCard}
      onPress={() => navigation.navigate('Tracking', { requestId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleSection}>
          <Text style={styles.requestMaterial}>{item.material_category}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor(item.status) + '20' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColor(item.status) },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: statusColor(item.status) },
              ]}
            >
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDate}>
          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
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

        {item.assigned_driver_id && (
          <View style={styles.driverRow}>
            <Text style={styles.driverIcon}>👤</Text>
            <Text style={styles.driverText}>Driver Assigned</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.viewDetailsText}>View Details →</Text>
      </View>
    </TouchableOpacity>
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  // Both statuses mean the same thing to a contractor - a driver has this
  // job - so they share a card rather than leaving in-transit requests
  // counted nowhere and the three cards not summing to the total.
  const inProgressCount = requests.filter(
    (r) => r.status === 'assigned' || r.status === 'in_transit'
  ).length;
  const completedCount = requests.filter((r) => r.status === 'completed').length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Requests</Text>
          <Text style={styles.headerSubtitle}>Track your delivery requests</Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
            <View style={[styles.statIndicator, { backgroundColor: statusColor('pending') }]} />
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{inProgressCount}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
            <View style={[styles.statIndicator, { backgroundColor: statusColor('assigned') }]} />
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
            <View style={[styles.statIndicator, { backgroundColor: statusColor('completed') }]} />
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('NewRequest')}
          >
            <Text style={styles.createButtonIcon}>+</Text>
            <View style={styles.createButtonText}>
              <Text style={styles.createButtonTitle}>New Request</Text>
              <Text style={styles.createButtonSubtitle}>Create delivery</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterTab,
                activeTab === tab && styles.filterTabActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === tab && styles.filterTabTextActive,
                ]}
              >
                {tab === 'all' ? 'All' : statusLabel(tab)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Requests List */}
        {loading && filteredRequests.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066CC" />
            <Text style={styles.loadingText}>Loading requests...</Text>
          </View>
        ) : filteredRequests.length > 0 ? (
          <View style={styles.requestsList}>
            <FlatList
              data={filteredRequests}
              keyExtractor={(item) => item.id || ''}
              renderItem={renderRequestCard}
              scrollEnabled={false}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Requests</Text>
            <Text style={styles.emptySubtitle}>
              You don't have any {activeTab !== 'all' ? activeTab : ''} requests yet.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('NewRequest')}
            >
              <Text style={styles.emptyButtonText}>Create First Request</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <BottomNavBar
        items={[
          { key: 'requests', icon: '📋', label: 'Requests', onPress: () => navigation.navigate('RequestList') },
          { key: 'new', icon: '➕', label: 'New', onPress: () => navigation.navigate('NewRequest') },
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

  // Stats Cards
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 8,
    textAlign: 'center',
  },
  statIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Action Buttons
  actionButtons: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#0066CC',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  createButtonIcon: {
    fontSize: 28,
    color: '#FFFFFF',
    marginRight: 16,
    fontWeight: '300',
  },
  createButtonText: {
    flex: 1,
  },
  createButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  createButtonSubtitle: {
    fontSize: 12,
    color: '#B3D9FF',
  },

  // Filter Tabs
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterTabActive: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },

  // Requests List
  requestsList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  requestCard: {
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
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
  },
  cardTitleSection: {
    flex: 1,
    marginRight: 12,
  },
  requestMaterial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 12,
    color: '#999999',
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
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  driverText: {
    fontSize: 13,
    color: '#666666',
  },
  cardFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 12,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },

  // Empty State
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RequestList;
