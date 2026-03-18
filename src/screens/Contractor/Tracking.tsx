import React from 'react';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/MainNavigator';

type TrackingNavigationProp = StackNavigationProp<MainStackParamList, 'Tracking'>;
type TrackingRouteProp = RouteProp<MainStackParamList, 'Tracking'>;

interface TrackingProps {
  navigation: TrackingNavigationProp;
  route: TrackingRouteProp;
}

const Tracking: React.FC<TrackingProps> = ({ navigation, route }) => {
  const { requestId } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Track Delivery</Text>
        <Text style={styles.subtitle}>Request ID: {requestId}</Text>
        <Text style={styles.subtitle}>Coming soon...</Text>
      </View>
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

export default Tracking;
