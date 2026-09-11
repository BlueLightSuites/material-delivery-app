import React from 'react';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';
import BottomNavBar from '../../components/navigation/BottomNavBar';

type JobDetailNavigationProp = StackNavigationProp<MainStackParamList, 'JobDetail'>;
type JobDetailRouteProp = RouteProp<MainStackParamList, 'JobDetail'>;

interface JobDetailProps {
  navigation: JobDetailNavigationProp;
  route: JobDetailRouteProp;
}

const JobDetail: React.FC<JobDetailProps> = ({ navigation, route }) => {
  const { jobId } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Job Details</Text>
        <Text style={styles.subtitle}>Job ID: {jobId}</Text>
        <Text style={styles.subtitle}>Coming soon...</Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
});

export default JobDetail;
