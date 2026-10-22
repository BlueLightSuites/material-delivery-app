import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { User } from '../models/User';
import { ReviewQueueItem } from '../services/api/documentReview';

// Common screens
import Profile from '../screens/Common/Profile';

// Driver screens
import JobsNearby from '../screens/Driver/JobsNearby';
import JobDetail from '../screens/Driver/JobDetail';
import Earnings from '../screens/Driver/Earnings';
import DriverVerification from '../screens/Driver/Verification';

// Contractor screens
import RequestList from '../screens/Contractor/RequestList';
import NewRequest from '../screens/Contractor/NewRequest';
import Tracking from '../screens/Contractor/Tracking';

// Admin screens
import ReviewQueue from '../screens/Admin/ReviewQueue';
import DocumentReview from '../screens/Admin/DocumentReview';

export type MainStackParamList = {
  // Common
  Profile: undefined;
  
  // Driver
  JobsNearby: undefined;
  JobDetail: { jobId: string };
  Earnings: undefined;
  DriverVerification: undefined;
  
  // Contractor
  RequestList: undefined;
  // requestId switches the same wizard into edit mode rather than
  // duplicating 300 lines of form UI in a second screen.
  NewRequest: { requestId?: string } | undefined;
  Tracking: { requestId: string };

  // Admin
  ReviewQueue: undefined;
  DocumentReview: { item: ReviewQueueItem };
};

const Stack = createStackNavigator<MainStackParamList>();

interface MainNavigatorProps {
  user: User | null;
}

const MainNavigator: React.FC<MainNavigatorProps> = ({ user }) => {
  const isDriver = user?.role === 'driver';
  const isContractor = user?.role === 'contractor';
  // Only decides which screens exist. What an admin can actually see and
  // do is checked server-side by is_admin(), so a client claiming the
  // role gets an empty, refusing queue.
  const isAdmin = user?.role === 'admin';

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTintColor: '#0066CC',
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
      }}
    >
      {isDriver && (
        <>
          <Stack.Screen
            name="JobsNearby"
            component={JobsNearby}
            options={{
              title: 'Available Jobs',
            }}
          />
          <Stack.Screen
            name="JobDetail"
            component={JobDetail}
            options={{
              title: 'Job Details',
            }}
          />
          <Stack.Screen
            name="Earnings"
            component={Earnings}
            options={{
              title: 'My Earnings',
            }}
          />
          <Stack.Screen
            name="DriverVerification"
            component={DriverVerification}
            options={{
              title: 'Vehicle & Documents',
            }}
          />
        </>
      )}

      {isContractor && (
        <>
          <Stack.Screen
            name="RequestList"
            component={RequestList}
            options={{
              title: 'My Requests',
            }}
          />
          <Stack.Screen
            name="NewRequest"
            component={NewRequest}
            options={({ route }) => ({
              title: route.params?.requestId ? 'Edit Request' : 'New Request',
            })}
          />
          <Stack.Screen
            name="Tracking"
            component={Tracking}
            options={{
              title: 'Track Delivery',
            }}
          />
        </>
      )}

      {isAdmin && (
        <>
          <Stack.Screen
            name="ReviewQueue"
            component={ReviewQueue}
            options={{
              title: 'Review',
            }}
          />
          <Stack.Screen
            name="DocumentReview"
            component={DocumentReview}
            options={{
              title: 'Review Document',
            }}
          />
        </>
      )}

      <Stack.Screen
        name="Profile"
        component={Profile}
        options={{
          title: 'My Profile',
        }}
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;
