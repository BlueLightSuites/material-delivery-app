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

type RequestListNavigationProp = StackNavigationProp<MainStackParamList, 'RequestList'>;

interface RequestListProps {
  navigation: RequestListNavigationProp;
}

const RequestList: React.FC<RequestListProps> = ({ navigation }) => {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'assigned' | 'completed'>(
    'all'
  );
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

  const getStatusColor = (
    status: 'pending' | 'assigned' | 'in_transit' | 'completed'
  ): string => {
    switch (status) {
      case 'pending':
        return '#FFA500';
      case 'assigned':
        return '#0066CC';
      case 'in_transit':
        return '#7C3AED';
      case 'completed':
        return '#10B981';
      default:
        return '#999999';
    }
  };

  const getStatusLabel = (
    status: 'pending' | 'assigned' | 'in_transit' | 'completed'
  ): string => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'assigned':
        return 'Assigned';
      case 'in_transit':
        return 'In Transit';
      case 'completed':
        return 'Completed';
      default:
        return 'Unknown';
    }
  };

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
              { backgroundColor: getStatusColor(item.status as any) + '20' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status as any) },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(item.status as any) },
              ]}
            >
              {getStatusLabel(item.status as any)}
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
  const assignedCount = requests.filter((r) => r.status === 'assigned').length;
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
            <View style={[styles.statIndicator, { backgroundColor: '#FFA500' }]} />
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{assignedCount}</Text>
            <Text style={styles.statLabel}>Assigned</Text>
            <View style={[styles.statIndicator, { backgroundColor: '#0066CC' }]} />
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
            <View style={[styles.statIndicator, { backgroundColor: '#10B981' }]} />
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
        <View style={styles.filterContainer}>
          {(['all', 'pending', 'assigned', 'completed'] as const).map((tab) => (
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
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('RequestList')}
        >
          <Text style={styles.navIcon}>📋</Text>
          <Text style={styles.navLabel}>Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('NewRequest')}
        >
          <Text style={styles.navIcon}>➕</Text>
          <Text style={styles.navLabel}>New</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('Tracking', { requestId: '1' })}
        >
          <Text style={styles.navIcon}>🚚</Text>
          <Text style={styles.navLabel}>Tracking</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
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
    gap: 8,
    marginBottom: 20,
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

  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 16,
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
  },
});

export default RequestList;
