import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../../navigation/MainNavigator';

type RequestListNavigationProp = StackNavigationProp<MainStackParamList, 'RequestList'>;

interface RequestListProps {
  navigation: RequestListNavigationProp;
}

interface DeliveryRequest {
  id: string;
  material: string;
  location: string;
  status: 'pending' | 'assigned' | 'in_transit' | 'completed';
  createdAt: string;
  driverName?: string;
}

const MOCK_REQUESTS: DeliveryRequest[] = [
  {
    id: '1',
    material: 'Lumber',
    location: '123 Oak St, Springfield',
    status: 'assigned',
    createdAt: 'Today',
    driverName: 'John Smith',
  },
  {
    id: '2',
    material: 'Drywall',
    location: '456 Pine Ave, Springfield',
    status: 'pending',
    createdAt: 'Yesterday',
  },
];

const RequestList: React.FC<RequestListProps> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'assigned' | 'completed'>(
    'all'
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

  const filteredRequests = MOCK_REQUESTS.filter((req) => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const renderRequestCard = ({ item }: { item: DeliveryRequest }) => (
    <TouchableOpacity
      style={styles.requestCard}
      onPress={() => navigation.navigate('Tracking', { requestId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleSection}>
          <Text style={styles.requestMaterial}>{item.material}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) + '20' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(item.status) },
              ]}
            >
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDate}>{item.createdAt}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>{item.location}</Text>
        </View>

        {item.driverName && (
          <View style={styles.driverRow}>
            <Text style={styles.driverIcon}>👤</Text>
            <Text style={styles.driverText}>Driver: {item.driverName}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.viewDetailsText}>View Details →</Text>
      </View>
    </TouchableOpacity>
  );

  const pendingCount = MOCK_REQUESTS.filter((r) => r.status === 'pending').length;
  const assignedCount = MOCK_REQUESTS.filter((r) => r.status === 'assigned').length;
  const completedCount = MOCK_REQUESTS.filter((r) => r.status === 'completed').length;

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
        {filteredRequests.length > 0 ? (
          <View style={styles.requestsList}>
            <FlatList
              data={filteredRequests}
              keyExtractor={(item) => item.id}
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
