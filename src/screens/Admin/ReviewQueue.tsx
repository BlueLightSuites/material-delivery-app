import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { useAuth } from '../../context/AuthContext';
import BottomNavBar from '../../components/navigation/BottomNavBar';
import { getReviewQueue, ReviewQueueItem } from '../../services/api/documentReview';
import { DOCUMENT_LABELS } from '../../services/api/driverVerification';

type ReviewQueueNavigationProp = StackNavigationProp<MainStackParamList, 'ReviewQueue'>;

interface ReviewQueueProps {
  navigation: ReviewQueueNavigationProp;
}

export const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

const ReviewQueue: React.FC<ReviewQueueProps> = ({ navigation }) => {
  const { accessToken } = useAuth();
  const [queue, setQueue] = useState<ReviewQueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    const items = await getReviewQueue(accessToken);
    setFailed(items === null);
    if (items) {
      setQueue(items);
    }
  }, [accessToken]);

  // Refetched on focus so a decision made on the detail screen drops the
  // document from the list when the reviewer comes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Document Review</Text>
          <Text style={styles.headerSubtitle}>
            {queue === null
              ? ' '
              : `${queue.length} ${queue.length === 1 ? 'document' : 'documents'} waiting`}
          </Text>
        </View>

        {queue === null && !failed ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#0066CC" />
        ) : failed && queue === null ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Couldn’t load the queue</Text>
            <Text style={styles.emptySubtitle}>
              Pull down to try again. If this keeps happening, check this account has the admin role.
            </Text>
          </View>
        ) : queue && queue.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySubtitle}>New uploads are announced in Slack.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {queue?.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => navigation.navigate('DocumentReview', { item })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.docLabel}>{DOCUMENT_LABELS[item.doc_type]}</Text>
                  <Text style={styles.waiting}>{timeAgo(item.submitted_at)}</Text>
                </View>
                <Text style={styles.driverName}>{item.driver_name || 'Unnamed driver'}</Text>
                {item.driver_email && <Text style={styles.driverEmail}>{item.driver_email}</Text>}
                <Text style={styles.reviewLink}>Review →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      <BottomNavBar role="admin" active="review" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  list: {
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 12,
    gap: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  docLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  waiting: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
  },
  driverName: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  driverEmail: {
    fontSize: 13,
    color: '#999999',
  },
  reviewLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
    marginTop: 8,
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

export default ReviewQueue;
